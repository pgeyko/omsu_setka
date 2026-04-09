package sync

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"omsu_mirror/internal/models"
	"time"

	"github.com/rs/zerolog/log"
)

// ... (SyncDictionaries remains unchanged, so we specify StartLine right at the top and include cacheCollection)

func (s *Syncer) SyncDictionaries(ctx context.Context) error {
	// 20.1 Move network calls out of the mutex lock
	log.Debug().Msg("Syncing groups from upstream...")
	upGroups, errGroups := s.client.FetchGroups(ctx)

	log.Debug().Msg("Syncing auditories from upstream...")
	upAuds, errAuds := s.client.FetchAuditories(ctx)

	log.Debug().Msg("Syncing tutors from upstream...")
	upTutors, errTutors := s.client.FetchTutors(ctx)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Load current state from DB as fallback if upstream failed
	groups, _ := s.dictRepo.GetAllGroups(ctx)
	auds, _ := s.dictRepo.GetAllAuditories(ctx)
	tutors, _ := s.dictRepo.GetAllTutors(ctx)

	hasChanges := false

	if errGroups == nil && len(upGroups) > 0 {
		groups = upGroups
		if err := s.dictRepo.UpsertGroups(ctx, groups); err != nil {
			log.Error().Err(err).Msg("Failed to upsert groups")
		}
		s.cacheCollection("groups", groups)
		hasChanges = true
	} else if errGroups != nil {
		s.recordFailure(ctx, "sync_groups", errGroups)
	}

	if errAuds == nil && len(upAuds) > 0 {
		auds = upAuds
		if err := s.dictRepo.UpsertAuditories(ctx, auds); err != nil {
			log.Error().Err(err).Msg("Failed to upsert auditories")
		}
		s.cacheCollection("auditories", auds)
		log.Info().Msgf("Successfully synced %d auditories", len(auds))
		hasChanges = true
	} else if errAuds != nil {
		s.recordFailure(ctx, "sync_auditories", errAuds)
	}

	if errTutors == nil && len(upTutors) > 0 {
		tutors = upTutors
		if err := s.dictRepo.UpsertTutors(ctx, tutors); err != nil {
			log.Error().Err(err).Msg("Failed to upsert tutors")
		}
		s.cacheCollection("tutors", tutors)
		hasChanges = true
	} else if errTutors != nil {
		s.recordFailure(ctx, "sync_tutors", errTutors)
	}

	if hasChanges || len(groups)+len(tutors)+len(auds) > 0 {
		log.Debug().Msg("Rebuilding search index...")
		s.searchIndex.Build(groups, tutors, auds)
	}

	if err := s.scheduleRepo.PutSyncMeta(ctx, "last_dict_sync", time.Now().Format(time.RFC3339)); err != nil {
		log.Warn().Err(err).Msg("Failed to update sync metadata")
	}

	s.recordSuccess(ctx, "dict_sync")
	return nil
}

func (s *Syncer) cacheCollection(key string, data interface{}) error {
	jsonData, err := json.Marshal(models.BFFResponse{
		Success:  true,
		Data:     data,
		CachedAt: time.Now(),
		Source:   "cache",
	})
	if err != nil {
		return err
	}

	s.memoryCache.Set(key, jsonData)

	// Create GZIP version
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(jsonData); err == nil {
		if err := gz.Close(); err == nil {
			s.memoryCache.SetGzip(key, buf.Bytes())
		}
	}
	
	return nil
}
