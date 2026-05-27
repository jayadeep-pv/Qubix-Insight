import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { configApi } from "../services/configApi";
import { Rule, RuleLookupAttribute, RuleLookupTemplate } from "../types/Rule";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import PageLoading from "../components/PageLoading";

export default function RuleForm() {

  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<Rule>({
    name: "",
    advisoryText: "",
    templateId: "",
    templateAttributeId: "",
    comparisonDirection: 0,
    impactCategory: 0,
    severity: 0,
    weight: 1,
    isActive: true
  });

  const [templates, setTemplates] = useState<RuleLookupTemplate[]>([]);
  const [attributes, setAttributes] = useState<RuleLookupAttribute[]>([]);

  const [comparisonDirections, setComparisonDirections] = useState<any[]>([]);
  const [impactCategories, setImpactCategories] = useState<any[]>([]);
  const [severities, setSeverities] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadLookups() {

    const data = await configApi.getRuleLookups();

    setTemplates(data.templates || []);
    setAttributes(data.attributes || []);

    const directions = await configApi.getChoiceOptions(
      "ilx_analysisrule",
      "ilx_analysisdirection"
    );

    const impacts = await configApi.getChoiceOptions(
      "ilx_analysisrule",
      "ilx_impactcategory"
    );

    const severityChoices = await configApi.getChoiceOptions(
      "ilx_analysisrule",
      "ilx_severity"
    );

    setComparisonDirections(directions || []);
    setImpactCategories(impacts || []);
    setSeverities(severityChoices || []);
  }

  async function loadRule() {

    if (!id) return;

    const rules = await configApi.getRules();
    const item = rules.find((x: any) => x.id === id);

    if (!item) return;

    setForm({
      id: item.id,
      name: item.name || "",
      advisoryText: item.advisoryText || "",
      templateId: item.templateId || "",
      templateAttributeId: item.templateAttributeId || "",
      comparisonDirection: item.comparisonDirection || 0,
      impactCategory: item.impactCategory || 0,
      severity: item.severity || 0,
      weight: item.weight || 1,
      isActive: item.isActive ?? true,
      createdOn: item.createdOn,
      modifiedOn: item.modifiedOn
    });
  }

  useEffect(() => {

    async function init() {

      setLoading(true);

      await loadLookups();

      if (isEdit) {
        await loadRule();
      }

      setLoading(false);
    }

    init();

  }, [id]);

  const filteredAttributes = useMemo(() => {

    if (!form.templateId) return [];

    return attributes.filter(a => a.templateId === form.templateId);

  }, [attributes, form.templateId]);

  function setField(field: keyof Rule, value: any) {

    setForm(prev => ({
      ...prev,
      [field]: value
    }));

  }

  async function save() {

    if (!form.name.trim()) {
      alert("Rule name is required");
      return;
    }

    if (!form.templateId) {
      alert("Template is required");
      return;
    }

    if (!form.templateAttributeId) {
      alert("Template attribute is required");
      return;
    }

    try {

      setSaving(true);

      if (isEdit) {
        await configApi.updateRule(form);
      } else {
        await configApi.createRule(form);
      }

      navigate("/admin/rules");

    } catch (err) {

      alert("Failed to save rule");

    } finally {

      setSaving(false);

    }
  }

  if (loading) return <PageLoading title="Loading rule…" />;

  return (

    <div className="page">

      <PageBreadcrumb
        items={[
          { label: "Rules", onClick: () => navigate("/admin/rules") },
          { label: id ? `Rule — ${form.name}` : "New Rule" },
        ]}
      />

      <div className="admin-form-header">
        <h2>{id ? `Rule — ${form.name}` : "New Rule"}</h2>
      </div>

      <div className="admin-form-card">

        <div className="form-group">
          <label htmlFor="rule-name">Rule Name *</label>
          <input
            type="text"
            id="rule-name"
            className="form-input"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="rule-advisory">Advisory Text</label>
          <textarea
            id="rule-advisory"
            className="form-input"
            value={form.advisoryText || ""}
            onChange={(e) => setField("advisoryText", e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="rule-template">Template *</label>
            <select
              id="rule-template"
              className="form-input"
              value={form.templateId}
              onChange={(e) => {
                setField("templateId", e.target.value);
                setField("templateAttributeId", "");
              }}
            >
              <option value="">Select template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rule-attribute">Template Attribute *</label>
            <select
              id="rule-attribute"
              className="form-input"
              value={form.templateAttributeId}
              onChange={(e) => setField("templateAttributeId", e.target.value)}
              disabled={!form.templateId}
            >
              <option value="">Select attribute…</option>
              {filteredAttributes.map((a) => (
                <option key={a.id} value={a.id}>{a.displayName || a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="rule-direction">Comparison Direction</label>
            <select
              id="rule-direction"
              className="form-input"
              value={form.comparisonDirection}
              onChange={(e) => setField("comparisonDirection", Number(e.target.value))}
            >
              <option value="">Select direction…</option>
              {comparisonDirections.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rule-impact">Impact Category</label>
            <select
              id="rule-impact"
              className="form-input"
              value={form.impactCategory}
              onChange={(e) => setField("impactCategory", Number(e.target.value))}
            >
              <option value="">Select impact…</option>
              {impactCategories.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="rule-severity">Severity</label>
            <select
              id="rule-severity"
              className="form-input"
              value={form.severity}
              onChange={(e) => setField("severity", Number(e.target.value))}
            >
              <option value="">Select severity…</option>
              {severities.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rule-weight">Weight</label>
            <input
              type="number"
              id="rule-weight"
              className="form-input"
              value={form.weight}
              onChange={(e) => setField("weight", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-group form-group-last">
          <label htmlFor="rule-active">Active</label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              id="rule-active"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
            />
            <span>This rule is active and applied during scoring</span>
          </label>
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
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/rules")}>
            Cancel
          </button>
        </div>

      </div>

    </div>

  );
}