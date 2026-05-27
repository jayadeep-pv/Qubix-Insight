import React, { useMemo, useState } from "react";

type FieldValue = string | string[];

type ExtractedField = {
  name: string;
  value: FieldValue;
};

type ApiResponse = {
  fields: ExtractedField[];
};

const fieldGroups: { title: string; fields: string[] }[] = [
  {
    title: "Lease Overview",
    fields: [
      "Lease Description",
      "Lease Type",
      "Property Name",
      "Date of Lease",
      "Lease Start",
      "Rent Commencement Date",
      "Lease Expiry",
      "Lease Period",
      "Status of Lease",
    ],
  },
  {
    title: "Parties",
    fields: [
      "Landlord Name",
      "Tenant Name",
      "Contact Name",
      "Contact Email",
      "Contact Phone",
    ],
  },
  {
    title: "Premises",
    fields: [
      "Rental Unit Description",
      "Rental Unit Type",
      "Rental Unit Gross Area",
      "Floor No.",
    ],
  },
  {
    title: "Financials",
    fields: [
      "Annual Total Rent excl. VAT and other charges",
      "Rent Charge Amount",
      "Rent Charge Period",
      "Payment Schedule",
      "Payment Dates",
      "Payment Currency",
      "Security Deposit Amount",
      "Premium Amount",
    ],
  },
  {
    title: "Review / Indexation",
    fields: [
      "Rent Review Date",
      "Review Mechanism",
      "Upward Only",
      "Index Used",
    ],
  },
  {
    title: "Options / Clauses",
    fields: [
      "First Possible Break Date",
      "Break Notice Period Start",
      "Break Notice Period End",
      "Automatic Renewal Status",
      "Renewal Option Status",
      "Obligation to Operate",
      "Restriction on Competition",
      "Environmental Obligation",
      "Sustainability Clause",
    ],
  },
];

const QuickLeaseExtractDemo: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const groupedFields = useMemo(() => {
    const map = new Map(fields.map((f) => [f.name, f]));

    return fieldGroups.map((group) => ({
      title: group.title,
      items: group.fields.map((fieldName) => {
        const existing = map.get(fieldName);
        return (
          existing ?? {
            name: fieldName,
            value: "",
          }
        );
      }),
    }));
  }, [fields]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setError("");
  };

  const handleExtract = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }

    setLoading(true);
    setError("");
    setFields([]);

    try {
      const response = await fetch("/api/QuickLeaseExtractDemo", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/pdf",
        },
        body: file,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Extraction failed.");
      }

      const data: ApiResponse = await response.json();
      setFields(data.fields || []);
    } catch (err: any) {
      setError(err?.message || "Something went wrong while extracting fields.");
    } finally {
      setLoading(false);
    }
  };

  const renderValue = (value: FieldValue) => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span style={styles.emptyValue}>—</span>;
      }

      return (
        <ul style={styles.valueList}>
          {value.map((item, index) => (
            <li key={`${item}-${index}`} style={styles.valueListItem}>
              {item}
            </li>
          ))}
        </ul>
      );
    }

    if (!value || !value.toString().trim()) {
      return <span style={styles.emptyValue}>—</span>;
    }

    return <span>{value}</span>;
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Lease Extraction Demo</h1>
            <p style={styles.subtitle}>
              Upload a lease document and extract key commercial lease fields.
            </p>
          </div>
        </header>

        <section style={styles.uploadCard}>
          <div style={styles.uploadRow}>
            <div style={styles.fileInputWrap}>
              <label htmlFor="lease-upload" style={styles.label}>
                Select lease document
              </label>
              <input
                id="lease-upload"
                title="Select lease document"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                style={styles.input}
              />
              <div style={styles.fileName}>
                {file ? file.name : "No file selected"}
              </div>
            </div>

            <button
              type="button"
              title="Extract fields from uploaded lease"
              onClick={handleExtract}
              disabled={loading}
              style={{
                ...styles.button,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            >
              {loading ? "Extracting..." : "Extract Fields"}
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}
        </section>

        {loading && (
          <section style={styles.loadingCard}>
            <div style={styles.loadingTitle}>Processing document...</div>
            <div style={styles.loadingText}>
              Reading the document and extracting lease fields.
            </div>
          </section>
        )}

        {!loading && fields.length > 0 && (
          <section style={styles.resultsWrap}>
            {groupedFields.map((group) => (
              <div key={group.title} style={styles.groupCard}>
                <h2 style={styles.groupTitle}>{group.title}</h2>

                <div style={styles.fieldGrid}>
                  {group.items.map((field) => (
                    <div key={field.name} style={styles.fieldCard}>
                      <div style={styles.fieldName}>{field.name}</div>
                      <div style={styles.fieldValue}>
                        {renderValue(field.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f6f7fb",
    padding: "24px",
  },
  container: {
    maxWidth: "1280px",
    margin: "0 auto",
  },
  header: {
    marginBottom: "24px",
    backgroundColor: "#ffffff",
    borderRadius: "18px",
    padding: "24px 28px",
    boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e5e7eb",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 700,
    color: "#111827",
  },
  subtitle: {
    margin: "8px 0 0 0",
    fontSize: "15px",
    color: "#6b7280",
  },
  uploadCard: {
    backgroundColor: "#ffffff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e5e7eb",
    marginBottom: "24px",
  },
  uploadRow: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  fileInputWrap: {
    flex: 1,
    minWidth: "300px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    display: "block",
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    backgroundColor: "#fff",
    fontSize: "14px",
  },
  fileName: {
    marginTop: "10px",
    fontSize: "14px",
    color: "#6b7280",
  },
  button: {
    height: "46px",
    minWidth: "160px",
    border: "none",
    borderRadius: "12px",
    backgroundColor: "#FA4616",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    padding: "0 20px",
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  error: {
    marginTop: "16px",
    padding: "12px 14px",
    borderRadius: "12px",
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontSize: "14px",
  },
  loadingCard: {
    backgroundColor: "#ffffff",
    borderRadius: "18px",
    padding: "28px",
    boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e5e7eb",
    marginBottom: "24px",
  },
  loadingTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#111827",
    marginBottom: "8px",
  },
  loadingText: {
    fontSize: "14px",
    color: "#6b7280",
  },
  resultsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  groupCard: {
    backgroundColor: "#ffffff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e5e7eb",
  },
  groupTitle: {
    margin: "0 0 18px 0",
    fontSize: "20px",
    fontWeight: 700,
    color: "#111827",
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "16px",
  },
  fieldCard: {
    backgroundColor: "#f9fafb",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    padding: "16px",
    minHeight: "110px",
  },
  fieldName: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#6b7280",
    marginBottom: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  fieldValue: {
    fontSize: "15px",
    color: "#111827",
    lineHeight: 1.6,
    wordBreak: "break-word",
  },
  emptyValue: {
    color: "#9ca3af",
  },
  valueList: {
    margin: 0,
    paddingLeft: "18px",
  },
  valueListItem: {
    marginBottom: "6px",
  },
};

export default QuickLeaseExtractDemo;