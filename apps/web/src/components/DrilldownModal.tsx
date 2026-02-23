// =============================================================================
// MindLog Web — Drilldown Modal Component
// Reusable modal for KPI drilldowns showing patient lists with summary stats
// =============================================================================

import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrilldownStat {
  value: string | number;
  label: string;
  color?: string;
}

export interface DrilldownPatient {
  id: string;
  name: string;
  initials: string;
  avatarColor?: string;
  meta?: string;
  value?: string | number;
  valueColor?: string;
  valueSecondary?: string;
  moodDot?: {
    value: number;
    color: string;
  };
}

export interface DrilldownConfig {
  icon: string;
  title: string;
  stats?: DrilldownStat[];
  patients: DrilldownPatient[];
  emptyMessage?: string;
}

interface Props {
  config: DrilldownConfig;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(5,8,16,0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    background: 'rgba(14,18,36,0.98)',
    border: '1px solid rgba(255,255,255,0.13)',
    borderRadius: 16,
    boxShadow: '0 12px 64px rgba(0,0,0,0.6)',
    width: '100%',
    maxWidth: 580,
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    animation: 'slideUp 0.25s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  titleIcon: {
    fontSize: 22,
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--ink)',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--ink-mid)',
    fontSize: 15,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  statsRow: {
    display: 'flex',
    gap: 14,
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  statCard: {
    flex: 1,
    textAlign: 'center' as const,
    padding: '12px 8px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  statValue: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 400,
    lineHeight: 1,
    color: 'var(--ink)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--ink-soft)',
    marginTop: 6,
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 0,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: 'white',
    flexShrink: 0,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--ink)',
  },
  itemMeta: {
    fontSize: 12,
    color: 'var(--ink-soft)',
    marginTop: 2,
  },
  itemValue: {
    textAlign: 'right' as const,
  },
  itemPrimary: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--ink)',
  },
  itemSecondary: {
    fontSize: 11,
    color: 'var(--ink-soft)',
    marginTop: 2,
  },
  moodDot: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: 'white',
  },
  empty: {
    padding: '48px 20px',
    textAlign: 'center' as const,
    color: 'var(--ink-soft)',
    fontSize: 14,
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerCount: {
    fontSize: 12,
    color: 'var(--ink-soft)',
  },
  footerActions: {
    display: 'flex',
    gap: 8,
  },
  btn: {
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--ink-mid)',
    transition: 'all 0.15s',
  },
  btnPrimary: {
    background: 'rgba(110,168,254,0.15)',
    borderColor: 'rgba(110,168,254,0.3)',
    color: '#6ea8fe',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DrilldownModal({ config, onClose }: Props) {
  const navigate = useNavigate();

  const handlePatientClick = (patientId: string) => {
    onClose();
    navigate(`/patients/${patientId}`);
  };

  const handleExport = () => {
    // Create CSV content
    const headers = ['Name', 'Value'];
    const rows = config.patients.map(p => [
      p.name,
      p.value ?? p.moodDot?.value ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.backdrop} onClick={onClose} data-testid="drilldown-backdrop">
      <div style={S.modal} onClick={(e) => e.stopPropagation()} data-testid="drilldown-modal">
        {/* Header */}
        <div style={S.header}>
          <div style={S.titleWrap}>
            <span style={S.titleIcon}>{config.icon}</span>
            <span style={S.title}>{config.title}</span>
          </div>
          <button
            style={S.closeBtn}
            onClick={onClose}
            data-testid="drilldown-close"
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255,77,109,0.15)';
              e.currentTarget.style.color = 'var(--critical)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'var(--ink-mid)';
            }}
          >
            ✕
          </button>
        </div>

        {/* Summary Stats */}
        {config.stats && config.stats.length > 0 && (
          <div style={S.statsRow} data-testid="drilldown-stats">
            {config.stats.map((stat, idx) => (
              <div key={idx} style={S.statCard} data-testid={`drilldown-stat-${idx}`}>
                <div style={{ ...S.statValue, color: stat.color ?? 'var(--ink)' }}>
                  {stat.value}
                </div>
                <div style={S.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Patient List */}
        <div style={S.content}>
          {config.patients.length === 0 ? (
            <div style={S.empty}>
              {config.emptyMessage ?? 'No patients found'}
            </div>
          ) : (
            <ul style={S.list}>
              {config.patients.map((patient, idx) => (
                <li
                  key={`${patient.id}-${idx}`}
                  style={S.item}
                  onClick={() => handlePatientClick(patient.id)}
                  data-testid={`drilldown-patient-${patient.id}`}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ ...S.avatar, background: patient.avatarColor ?? '#4a5568' }}>
                    {patient.initials}
                  </div>
                  <div style={S.itemInfo}>
                    <div style={S.itemName}>{patient.name}</div>
                    {patient.meta && <div style={S.itemMeta}>{patient.meta}</div>}
                  </div>
                  <div style={S.itemValue}>
                    {patient.moodDot ? (
                      <div style={{ ...S.moodDot, background: patient.moodDot.color }}>
                        {patient.moodDot.value}
                      </div>
                    ) : patient.value ? (
                      <>
                        <div style={{ ...S.itemPrimary, color: patient.valueColor ?? 'var(--ink)' }}>
                          {patient.value}
                        </div>
                        {patient.valueSecondary && (
                          <div style={S.itemSecondary}>{patient.valueSecondary}</div>
                        )}
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <div style={S.footerCount}>
            {config.patients.length} patient{config.patients.length !== 1 ? 's' : ''}
          </div>
          <div style={S.footerActions}>
            <button style={S.btn} onClick={onClose}>
              Close
            </button>
            <button
              style={{ ...S.btn, ...S.btnPrimary }}
              onClick={handleExport}
              data-testid="drilldown-export"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
