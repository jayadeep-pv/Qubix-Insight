import { useEffect, useState } from "react";
import { configApi } from "../services/configApi";
import { useNavigate, useParams } from "react-router-dom";
import RulesList from "../components/templates/RulesList";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import PageLoading from "../components/PageLoading";

export default function TemplateAttributeForm() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [templates,setTemplates] = useState<any[]>([]);
  const [categoryOptions,setCategoryOptions] = useState<any[]>([]);
  const [dataTypeOptions,setDataTypeOptions] = useState<any[]>([]);
  const [usageModeOptions,setUsageModeOptions] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState("details");

  const [form,setForm] = useState({
    templateId:"",
    name:"",
    displayName:"",
    category:"",
    expectedDataType:"",
    usageMode:"",
    displayOrder:1,
    attributeKey:"",
    aiExtractionHint:"",
    isMandatory:false,
    isActive:true,
    createdOn:"",
    modifiedOn:""
  });

  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);

  /* =========================
     LOAD CHOICE OPTIONS
  ========================= */
  async function loadChoices(){
    try{
      const [categories, dataTypes, usageModes] = await Promise.all([
        configApi.getChoiceOptions("ilx_templateattribute", "ilx_category"),
        configApi.getChoiceOptions("ilx_templateattribute", "ilx_expecteddatatype"),
        configApi.getChoiceOptions("ilx_templateattribute", "ilx_usagemode"),
      ]);
      setCategoryOptions(categories);
      setDataTypeOptions(dataTypes);
      setUsageModeOptions(usageModes);
    }catch(err){
      console.error("Choice load failed",err);
    }
  }

  /* =========================
     LOAD TEMPLATES
  ========================= */
  async function loadTemplates(){
    try{
      const list = await configApi.getAllTemplates();
      setTemplates(list);
    }catch(err){
      console.error("Template load failed",err);
    }
  }

  /* =========================
     LOAD ATTRIBUTE
  ========================= */
  async function load(){
    if(!id) return;

    try{
      setLoading(true);

      const list = await configApi.getAllTemplateAttributes();
      const item = list.find((x:any)=>x.id===id);

      if(!item) return;

      setForm({
        templateId:item.templateId || "",
        name:item.name || "",
        displayName:item.displayName || "",
        category:item.category?.toString() || "",
        expectedDataType:item.expectedDataType?.toString() || "",
        usageMode:item.usageMode?.toString() || "",
        displayOrder:item.displayOrder || 1,
        attributeKey:item.attributeKey || "",
        aiExtractionHint:item.aiExtractionHint || "",
        isMandatory:item.isMandatory || false,
        isActive:item.isActive ?? true,
        createdOn:item.createdOn,
        modifiedOn:item.modifiedOn
      });

    }catch(err){
      console.error("Load failed",err);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    loadChoices();
    loadTemplates();
    load();
  },[]);

  /* =========================
     SAVE
  ========================= */
  async function save(){

    if(!form.templateId){
      alert("Template is required");
      return;
    }

    if(!form.name.trim()){
      alert("Name is required");
      return;
    }

    try{

      setSaving(true);

      const payload: any = {
        templateId:form.templateId,
        name:form.name,
        displayName:form.displayName,
        category:Number(form.category),
        expectedDataType:Number(form.expectedDataType),
        displayOrder:form.displayOrder,
        attributeKey:form.attributeKey,
        aiExtractionHint:form.aiExtractionHint,
        isMandatory:form.isMandatory
      };

      if (form.usageMode !== "") {
        payload.usageMode = Number(form.usageMode);
      }

      if(id){
        await configApi.updateTemplateAttribute({
          id,
          ...payload
        });
      }else{
        await configApi.createTemplateAttribute(payload);
      }

      navigate("/admin/template-attributes");

    }catch(err){
      console.error("Save failed",err);
      alert("Save failed");
    }finally{
      setSaving(false);
    }
  }

  if (loading) return <PageLoading title="Loading attribute…" />;

  return(

    <div className="page">

      <PageBreadcrumb
        items={[
          { label: "Template Attributes", onClick: () => navigate("/admin/template-attributes") },
          { label: id ? `Template Attribute — ${form.name}` : "New Template Attribute" },
        ]}
      />

      <div className="admin-form-header">
        <h2>{id ? `Template Attribute — ${form.name}` : "New Template Attribute"}</h2>
      </div>

      {id && (
        <div className="tabs">
          <button
            type="button"
            className={activeTab === "details" ? "tab active" : "tab"}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={activeTab === "rules" ? "tab active" : "tab"}
            onClick={() => setActiveTab("rules")}
          >
            Rules
          </button>
        </div>
      )}

      {activeTab === "details" && (
        <div className="admin-form-card">

          <div className="form-group">
            <label htmlFor="template">Template *</label>
            <select
              className="form-input"
              id="template"
              value={form.templateId}
              onChange={(e) => setForm({...form, templateId: e.target.value})}
            >
              <option value="">Select template…</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                className="form-input"
                id="name"
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                type="text"
                className="form-input"
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm({...form, displayName: e.target.value})}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="category">Attribute Category</label>
              <select
                className="form-input"
                id="category"
                value={form.category}
                onChange={(e) => setForm({...form, category: e.target.value})}
              >
                <option value="">Select…</option>
                {categoryOptions.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="expectedDataType">Expected Data Type</label>
              <select
                className="form-input"
                id="expectedDataType"
                value={form.expectedDataType}
                onChange={(e) => setForm({...form, expectedDataType: e.target.value})}
              >
                <option value="">Select…</option>
                {dataTypeOptions.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="usageMode">Usage Mode</label>
              <select
                className="form-input"
                id="usageMode"
                value={form.usageMode}
                onChange={(e) => setForm({...form, usageMode: e.target.value})}
              >
                <option value="">Select…</option>
                {usageModeOptions.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="displayOrder">Display Order</label>
              <input
                type="number"
                className="form-input"
                id="displayOrder"
                value={form.displayOrder}
                onChange={(e) => setForm({...form, displayOrder: Number(e.target.value)})}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="attributeKey">Attribute Key</label>
            <input
              type="text"
              className="form-input"
              id="attributeKey"
              value={form.attributeKey}
              onChange={(e) => setForm({...form, attributeKey: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label htmlFor="aiExtractionHint">AI Extraction Hint</label>
            <textarea
              className="form-input"
              id="aiExtractionHint"
              value={form.aiExtractionHint}
              onChange={(e) => setForm({...form, aiExtractionHint: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isMandatory}
                onChange={(e) => setForm({...form, isMandatory: e.target.checked})}
              />
              <span>Mandatory</span>
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
            <button type="button" className="btn-secondary" onClick={() => navigate("/admin/template-attributes")}>
              Cancel
            </button>
          </div>

        </div>
      )}

      {activeTab === "rules" && id && (
        <div className="admin-tab-panel">
          <RulesList templateAttributeId={id} hideHeader />
        </div>
      )}

    </div>
  );
}
