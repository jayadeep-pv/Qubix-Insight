interface AiProfile {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface Props {
  aiOptions: string[];
  setAiOptions: (v: string[]) => void;
  aiProfiles: AiProfile[];
  selectedProfiles: string[];
  setSelectedProfiles: (v: string[]) => void;
}

export default function AiSettingsPanel({
  aiOptions,
  setAiOptions,
  aiProfiles,
  selectedProfiles,
  setSelectedProfiles
}: Props) {

  const isSummaryEnabled = aiOptions.includes("executiveSummary");

  return (
    <div className="ai-panel">
      <h3>AI Settings</h3>

      <div className="form-group">
        <label>AI Options</label>

        <div className="scope-row">
          {[
            { label: "Executive Summary", value: "executiveSummary" },
            { label: "Attribute Insights", value: "attributeInsight" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`scope-chip ${
                aiOptions.includes(option.value) ? "selected" : ""
              }`}
              onClick={() =>
                aiOptions.includes(option.value)
                  ? setAiOptions(aiOptions.filter((v) => v !== option.value))
                  : setAiOptions([...aiOptions, option.value])
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Insight Profiles</label>

        {aiProfiles.length === 0 ? (
          <p className="aip-no-profiles">
            Select a template to load its configured profiles.
          </p>
        ) : (
          <div className={`aip-check-list${isSummaryEnabled ? "" : " aip-check-list--disabled"}`}>
            {aiProfiles.map((profile) => {
              const isSelected = selectedProfiles.includes(profile.id);
              return (
                <label key={profile.id} className={`aip-check-row${isSelected ? " aip-check-row--on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                      isSelected
                        ? setSelectedProfiles(selectedProfiles.filter((id) => id !== profile.id))
                        : setSelectedProfiles([...selectedProfiles, profile.id])
                    }
                    className="aip-check-input"
                  />
                  <span className="aip-check-name">{profile.name}</span>
                  {profile.isDefault && (
                    <span className="aip-default-badge">default</span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
