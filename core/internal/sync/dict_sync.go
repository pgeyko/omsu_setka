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

	log.Debug().Msg("Syncing groups...")
	groups, err := s.client.FetchGroups(ctx)
	if err != nil {
		s.recordFailure(ctx, "sync_groups", err)
		return err
	}
	if err := s.dictRepo.UpsertGroups(ctx, groups); err != nil {
		return err
	}
	if err := s.cacheCollection("groups", groups); err != nil {
		log.Error().Err(err).Msg("Failed to cache groups collection")
	}

	log.Debug().Msg("Syncing auditories...")
	auds, err := s.client.FetchAuditories(ctx)
	if err != nil {
		s.recordFailure(ctx, "sync_auditories", err)
		return err
	}
	if err := s.dictRepo.UpsertAuditories(ctx, auds); err != nil {
		return err
	}
	if err := s.cacheCollection("auditories", auds); err != nil {
		log.Error().Err(err).Msg("Failed to cache auditories collection")
	}

	log.Debug().Msg("Syncing tutors...")
	tutors, err := s.client.FetchTutors(ctx)
	if err != nil {
		s.recordFailure(ctx, "sync_tutors", err)
		return err
	}
	if err := s.dictRepo.UpsertTutors(ctx, tutors); err != nil {
		return err
	}
	if err := s.cacheCollection("tutors", tutors); err != nil {
		log.Error().Err(err).Msg("Failed to cache tutors collection")
	}

	log.Debug().Msg("Rebuilding search index...")
	s.searchIndex.Build(groups, tutors, auds)

	if err := s.scheduleRepo.PutSyncMeta(ctx, "last_dict_sync", time.Now().Format(time.RFC3339)); err != nil {
		log.Warn().Err(err).Msg("Failed to update sync metadata")
	}

	s.recordSuccess(ctx, "dict_sync")
	log.Info().Msgf("Dictionary sync completed: %d groups, %d auditories, %d tutors", len(groups), len(auds), len(tutors))
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
