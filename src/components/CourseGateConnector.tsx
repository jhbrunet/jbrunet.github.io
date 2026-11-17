'use client';

export type ConnectorVariant = 'start' | 'standard' | 'bypass' | 'apex' | 'finish';

interface CourseGateConnectorProps {
  fromGate: string;
  toGate: string;
  activeGate: string;
  variant?: ConnectorVariant;
  reducedMotion?: boolean;
}

function getArcPath(fromGate: string, toGate: string): string {
  if (fromGate === '00' && toGate === '01') {
    return 'M 50 0 C 50 48, 72 52, 72 100';
  }
  if (toGate === 'FINISH') {
    return 'M 28 0 C 28 48, 50 52, 50 100';
  }
  const toNum = Number(toGate);
  const toOdd = Number.isFinite(toNum) && toNum % 2 === 1;
  return toOdd
    ? 'M 28 0 C 28 48, 72 52, 72 100'
    : 'M 72 0 C 72 48, 28 52, 28 100';
}

export function CourseGateConnector({
  fromGate,
  toGate,
  activeGate,
  variant = 'standard',
  reducedMotion = false,
}: CourseGateConnectorProps) {
  const activeNum = Number(activeGate || '0');
  const toNum = toGate === 'FINISH' ? 8 : Number(toGate);
  const isOddTarget = toGate !== 'FINISH' && Number.isFinite(toNum) && toNum % 2 === 1;
  const isActive =
    toGate === 'FINISH' ? activeGate === '08' : activeGate === toGate;
  const isReached = reducedMotion || activeNum >= toNum;
  const arcPath = getArcPath(fromGate, toGate);

  return (
    <div
      className={`course-gate-connector is-${variant} ${
        isOddTarget ? 'is-side-right' : toGate === 'FINISH' ? 'is-side-finish' : 'is-side-left'
      } ${isActive ? 'is-active' : ''} ${isReached ? 'is-reached' : ''}`}
      data-connector={`${fromGate}-${toGate}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="connector-arc-svg"
        aria-hidden="true"
      >
        <line
          x1={50}
          y1={0}
          x2={50}
          y2={100}
          vectorEffect="non-scaling-stroke"
          className="connector-fall-axis"
        />
        <path
          d={arcPath}
          vectorEffect="non-scaling-stroke"
          className="connector-arc-path"
        />
      </svg>

      {toGate === 'FINISH' ? (
        <div className="connector-finish-corral">
          <span className="connector-finish-line" />
          <span className="connector-gate-marker is-finish-left">
            <span className="gate-pole" />
            <span className="gate-panel" />
          </span>
          <span className="connector-gate-marker is-finish-right">
            <span className="gate-pole" />
            <span className="gate-panel" />
          </span>
        </div>
      ) : (
        <div
          className={`connector-gate-marker ${
            isOddTarget ? 'is-odd-gate' : 'is-even-gate'
          }`}
        >
          <span className="gate-pole" />
          <span className="gate-panel" />
        </div>
      )}
    </div>
  );
}
