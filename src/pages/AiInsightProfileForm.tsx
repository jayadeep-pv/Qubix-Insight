import { useEffect, useState } from "react"
import { configApi } from "../services/configApi"
import { AiInsightProfile } from "../types/AiInsightProfile"
import { useNavigate, useParams } from "react-router-dom"
import { PageBreadcrumb } from "../components/PageBreadcrumb"
import PageLoading from "../components/PageLoading"

export default function AiInsightProfileForm() {

  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState<AiInsightProfile>({
    profileName: "",
    profileCode: "",
    profileStatus: undefined,
    prompt: "",
    displayOrder: 0,
    statecode: 0
  })

  const [profileStatuses, setProfileStatuses] = useState<any[]>([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  function setField(field: keyof AiInsightProfile, value: any) {

    setForm(prev => ({
      ...prev,
      [field]: value
    }))

  }

  async function loadLookups() {

    const statuses = await configApi.getChoiceOptions(
      "ilx_aiinsightprofile",
      "ilx_profilestatus"
    )

    setProfileStatuses(statuses || [])

  }

  async function loadProfile() {

    if (!id) return

    const list = await configApi.getAllAiInsightProfiles()

    const item = list.find((x: any) => x.id === id)

    if (!item) return

    setForm({
      id: item.id,
      profileName: item.profileName || "",
      profileCode: item.profileCode || "",
      profileStatus: item.profileStatus,
      prompt: item.prompt || "",
      displayOrder: item.displayOrder || 0,
      statecode: item.statecode ?? 0,
      createdOn: item.createdOn,
      modifiedOn: item.modifiedOn
    })

  }

  useEffect(() => {

    async function init() {

      setLoading(true)

      await loadLookups()

      if (isEdit) {
        await loadProfile()
      }

      setLoading(false)

    }

    init()

  }, [id])

  async function save() {

    if (!form.profileName?.trim()) {
      alert("Profile Name is required")
      return
    }

    try {

      setSaving(true)

      if (isEdit) {

        await configApi.updateAiInsightProfile(form)

      } else {

        await configApi.createAiInsightProfile(form)

      }

      navigate("/admin/ai-insight-profiles")

    } catch {

      alert("Failed to save profile")

    } finally {

      setSaving(false)

    }

  }

  if (loading) return <PageLoading title="Loading profile…" />;

  return (

    <div className="page">

      <PageBreadcrumb
        items={[
          { label: "AI Insight Profiles", onClick: () => navigate("/admin/ai-insight-profiles") },
          { label: isEdit ? "Edit AI Insight Profile" : "New AI Insight Profile" },
        ]}
      />

      <div className="admin-form-header">
        <h2>{isEdit ? "Edit AI Insight Profile" : "New AI Insight Profile"}</h2>
      </div>

      <div className="admin-form-card">

        <div className="form-group">
          <label htmlFor="profile-name">Profile Name *</label>
          <input
            type="text"
            id="profile-name"
            className="form-input"
            value={form.profileName}
            onChange={(e) => setField("profileName", e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="profile-code">Profile Code</label>
            <input
              type="text"
              id="profile-code"
              className="form-input"
              value={form.profileCode || ""}
              onChange={(e) => setField("profileCode", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="display-order">Display Order</label>
            <input
              type="number"
              id="display-order"
              className="form-input"
              value={form.displayOrder || 0}
              onChange={(e) => setField("displayOrder", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="profile-status">Profile Status</label>
          <select
            id="profile-status"
            className="form-input"
            value={form.profileStatus ?? ""}
            onChange={(e) => setField("profileStatus", Number(e.target.value))}
          >
            <option value="">Select status…</option>
            {profileStatuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            className="form-input"
            rows={6}
            value={form.prompt || ""}
            onChange={(e) => setField("prompt", e.target.value)}
          />
        </div>

        {(form.createdOn || form.modifiedOn) && (
          <div className="meta">
            {form.createdOn && <span>Created: {new Date(form.createdOn).toLocaleString()}</span>}
            {form.modifiedOn && <span>Modified: {new Date(form.modifiedOn).toLocaleString()}</span>}
          </div>
        )}

        <div className="form-footer">
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/ai-insight-profiles")}>
            Cancel
          </button>
        </div>

      </div>

    </div>

  )

}