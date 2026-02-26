import Logo from "./Logo.jsx";

const TABS = [
  "Home",
  "Players",
  "Draft",
  "Compare",
  "Prospects",
  "Teams",
  "Games & Brackets",
  "Predictions",
  "Defense",
];

export { TABS };

export default function Nav({ tab, go, goBack, canGoBack }) {
  return (
    <div className="nav-bar">
      <div className="nav-inner">
        {/* Left: back button + brand */}
        <div className="nav-left">
          {canGoBack && (
            <button className="back-btn" onClick={goBack} title="Go back">
              ←
            </button>
          )}
          <Logo size={34} text onClick={() => go("Home")} />
        </div>

        {/* Right: tab nav */}
        <nav className="nav-tabs">
          {TABS.map(t => (
            <button
              key={t}
              className={`nav-tab${tab === t ? " active" : ""}`}
              onClick={() => go(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
