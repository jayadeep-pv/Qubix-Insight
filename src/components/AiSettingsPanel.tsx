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

        {aiProfiles.length === 0 && isSummaryEnabled && (
          <p className="aip-no-profiles">
            Select a template to load its configured profiles.
          </p>
        )}

        <div className={`profile-row${isSummaryEnabled ? "" : " profile-row--disabled"}`}>
          {aiProfiles.map((profile) => {
            const isSelected = selectedProfiles.includes(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                className={`profile-chip${isSelected ? " selected" : ""}`}
                onClick={() =>
                  isSelected
                    ? setSelectedProfiles(selectedProfiles.filter((id) => id !== profile.id))
                    : setSelectedProfiles([...selectedProfiles, profile.id])
                }
              >
                {profile.name}
                {profile.isDefault && (
                  <span className="aip-default-badge">*</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
