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
	s.mu.Lock()
	defer s.mu.Unlock()

	// Load current state from DB as fallback
	groups, _ := s.dictRepo.GetAllGroups(ctx)
	auds, _ := s.dictRepo.GetAllAuditories(ctx)
	tutors, _ := s.dictRepo.GetAllTutors(ctx)

	log.Debug().Msg("Syncing groups...")
	upGroups, err := s.client.FetchGroups(ctx)
	if err == nil && len(upGroups) > 0 {
		groups = upGroups
		if err := s.dictRepo.UpsertGroups(ctx, groups); err != nil {
			log.Error().Err(err).Msg("Failed to upsert groups")
		}
		s.cacheCollection("groups", groups)
	} else if err != nil {
		s.recordFailure(ctx, "sync_groups", err)
	}

	log.Debug().Msg("Syncing auditories...")
	upAuds, err := s.client.FetchAuditories(ctx)
	if err == nil && len(upAuds) > 0 {
		auds = upAuds
		if err := s.dictRepo.UpsertAuditories(ctx, auds); err != nil {
			log.Error().Err(err).Msg("Failed to upsert auditories")
		}
		s.cacheCollection("auditories", auds)
		log.Info().Msgf("Successfully synced %d auditories", len(auds))
	} else {
		if err != nil {
			s.recordFailure(ctx, "sync_auditories", err)
		}
		// If we have nothing in DB, and upstream failed, auds is still empty
		if len(auds) > 0 {
			s.cacheCollection("auditories", auds)
			log.Info().Msgf("Using %d auditories from DB (upstream returned nothing)", len(auds))
		}
	}

	log.Debug().Msg("Syncing tutors...")
	upTutors, err := s.client.FetchTutors(ctx)
	if err == nil && len(upTutors) > 0 {
		tutors = upTutors
		if err := s.dictRepo.UpsertTutors(ctx, tutors); err != nil {
			log.Error().Err(err).Msg("Failed to upsert tutors")
		}
		s.cacheCollection("tutors", tutors)
	} else if err != nil {
		s.recordFailure(ctx, "sync_tutors", err)
	}

	log.Debug().Msg("Rebuilding search index...")
	s.searchIndex.Build(groups, tutors, auds)

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
