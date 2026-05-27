import { useState, useEffect } from "react";

interface DocumentType {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
}

interface AiProfile {
  id: string;
  name: string;
}

const UploadPage = () => {
  const [comparisonName, setComparisonName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState("");

  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);

  /* ================================
     Load Document Types
  ================================= */
  useEffect(() => {
    fetch("http://127.0.0.1:7071/api/GetDocumentTypes")
      .then(res => res.json())
      .then(data => setDocumentTypes(data))
      .catch(err => {
        console.error(err);
        setStatus("Failed to load document types");
      });
  }, []);

  /* ================================
     Load AI Insight Profiles
  ================================= */
  useEffect(() => {
    fetch("http://127.0.0.1:7071/api/GetAiInsightProfiles")
      .then(res => res.json())
      .then(data => setAiProfiles(data))
      .catch(err => {
        console.error(err);
        setStatus("Failed to load AI profiles");
      });
  }, []);

  /* ================================
     Load Templates when Document Type changes
  ================================= */
  useEffect(() => {
    if (!documentType) {
      setTemplates([]);
      return;
    }

    fetch(
      `http://127.0.0.1:7071/api/GetTemplates?documentTypeId=${documentType}`
    )
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch templates");
        return res.json();
      })
      .then(data => setTemplates(data))
      .catch(err => {
        console.error(err);
        setStatus("Failed to load templates");
      });
  }, [documentType]);

  /* ================================
     Upload Handler
  ================================= */
  const handleUpload = async () => {
    if (!comparisonName.trim()) {
      setStatus("Please enter comparison name");
      return;
    }

    if (!documentType) {
      setStatus("Please select document type");
      return;
    }

    if (!templateId) {
      setStatus("Please select template");
      return;
    }

    if (!files?.length) {
      setStatus("Please select files");
      return;
    }

    if (selectedProfiles.length === 0) {
      setStatus("Please select at least one AI Insight Profile");
      return;
    }

    setStatus("Uploading documents...");

    const formData = new FormData();
    formData.append("comparisonName", comparisonName);
    formData.append("documentTypeId", documentType);
    formData.append("comparisonTemplateId", templateId);

    Array.from(files).forEach(file =>
      formData.append("files", file)
    );

    try {
      const uploadResponse = await fetch(
        "http://127.0.0.1:7071/api/UploadAndStartComparison",
        {
          method: "POST",
          body: formData
        }
      );

      if (!uploadResponse.ok) throw new Error("Upload failed");

      const result = await uploadResponse.json();

      setStatus("Creating AI insight records...");

      await fetch(
        "http://127.0.0.1:7071/api/CreateComparisonInsights",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comparisonRunId: result.runRecordId,
            selectedProfileIds: selectedProfiles
          })
        }
      );

      setStatus("Running AI insights...");

      await fetch(
        "http://127.0.0.1:7071/api/ExecuteComparisonRun",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comparisonRunId: result.runRecordId
          })
        }
      );

      setStatus("Comparison completed successfully ✅");
    } catch (error) {
      console.error(error);
      setStatus("Upload failed ❌");
    }
  };

  /* ================================
     UI
  ================================= */
  return (
    <div style={{ maxWidth: 800, margin: "40px auto" }}>
      <h1>Document Comparison</h1>

      {/* Comparison Name */}
      <div style={{ marginTop: 20 }}>
        <label htmlFor="comparisonName">Comparison Name</label>
        <input
          id="comparisonName"
          type="text"
          value={comparisonName}
          onChange={e => setComparisonName(e.target.value)}
          placeholder="e.g. Quote Comparison"
          style={{ width: "100%", padding: 8, marginTop: 6 }}
        />
      </div>

      {/* Document Type */}
      <div style={{ marginTop: 20 }}>
        <label htmlFor="documentType">Document Type</label>
        <select
          id="documentType"
          value={documentType}
          onChange={e => setDocumentType(e.target.value)}
          style={{ width: "100%", padding: 8, marginTop: 6 }}
        >
          <option value="">Select document type</option>
          {documentTypes.map(dt => (
            <option key={dt.id} value={dt.id}>
              {dt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Template */}
      <div style={{ marginTop: 20 }}>
        <label htmlFor="template">Comparison Template</label>
        <select
          id="template"
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          disabled={!documentType}
          style={{ width: "100%", padding: 8, marginTop: 6 }}
        >
          <option value="">
            {documentType
              ? "Select template"
              : "Select document type first"}
          </option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* AI Profiles */}
      <div style={{ marginTop: 20 }}>
        <label htmlFor="aiProfiles">AI Insight Profiles</label>
        <select
          id="aiProfiles"
          multiple
          value={selectedProfiles}
          onChange={e =>
            setSelectedProfiles(
              Array.from(e.target.selectedOptions, option => option.value)
            )
          }
          style={{ width: "100%", minHeight: 120, marginTop: 6 }}
        >
          {aiProfiles.map(profile => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>

      {/* Upload Files */}
      <div style={{ marginTop: 30 }}>
        <label htmlFor="fileUpload">Upload Documents</label>
        <input
          id="fileUpload"
          type="file"
          multiple
          onChange={e => setFiles(e.target.files)}
          style={{ display: "block", marginTop: 6 }}
        />
      </div>

      {/* Button */}
      <div style={{ marginTop: 20 }}>
        <button onClick={handleUpload}>
          Generate Results
        </button>
      </div>

      {/* Status */}
      <div style={{ marginTop: 20, fontWeight: 600 }}>
        {status}
      </div>
    </div>
  );
};

export default UploadPage;