import { motion } from 'motion/react';
import type { Program } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { FskBadge } from '@/components/ui/TimeBadge';

export function ProgramDetailsModal({
  program,
  onClose,
  onPlay,
  onReminder,
}: {
  program: Program | null;
  onClose: () => void;
  onPlay: () => void;
  onReminder: () => void;
}) {
  if (!program) return <Modal open={false} onClose={onClose} children={null} />;
  const streamUrl = program.stream_url || program.stream;
  const imageUrl = program.icon_url || program.image_url;

  return (
    <Modal open={!!program} onClose={onClose}>
      <div className="modal-header">
        <h3>Programmdetails</h3>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </div>
      <div className="modal-body">
        <div className="modal-body-content">
          <div className="modal-program-header">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={program.title}
                className="modal-program-image"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                className="modal-program-image"
                style={{
                  background: 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                Kein Bild
              </div>
            )}
            <div className="modal-program-info">
              <h3 className="modal-program-title">{program.title}</h3>
              {program.subtitle && (
                <div className="modal-program-subtitle">{program.subtitle}</div>
              )}
              <div className="modal-program-meta">
                {program.category && (
                  <span className="program-category">{program.category}</span>
                )}
                {program.duration && (
                  <span className="program-duration">{program.duration} min</span>
                )}
                {program.rating && <FskBadge rating={program.rating} />}
                {program.episode_formatted && (
                  <span className="program-episode">{program.episode_formatted}</span>
                )}
              </div>
            </div>
          </div>
          {program.description && (
            <div className="modal-program-description">
              <p>{program.description}</p>
            </div>
          )}
          <div className="modal-program-details">
            <div className="detail-item">
              <span className="detail-label">Sendezeit</span>
              <span className="detail-value">
                {program.start_time_local} - {program.end_time_local}
              </span>
            </div>
            {program.date_local && (
              <div className="detail-item">
                <span className="detail-label">Datum</span>
                <span className="detail-value">{program.date_local}</span>
              </div>
            )}
            {program.directors && (
              <div className="detail-item">
                <span className="detail-label">Regie</span>
                <span className="detail-value">{program.directors}</span>
              </div>
            )}
            {program.actors && (
              <div className="detail-item">
                <span className="detail-label">Besetzung</span>
                <span className="detail-value">{program.actors}</span>
              </div>
            )}
          </div>
          <div className="modal-actions">
            {streamUrl && (
              <motion.button
                className="btn-play"
                onClick={onPlay}
                whileTap={{ scale: 0.97 }}
              >
                <span>▶</span> Jetzt abspielen
              </motion.button>
            )}
            <motion.button
              className="btn-reminder"
              onClick={onReminder}
              whileTap={{ scale: 0.97 }}
            >
              <span>⏰</span> Erinnerung setzen
            </motion.button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
