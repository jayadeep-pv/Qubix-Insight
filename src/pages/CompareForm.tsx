import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, GitCompare } from "lucide-react";

const CompareForm: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="stub-page">
      <button className="stub-back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={15} /> Back
      </button>
      <div className="stub-icon stub-icon--blue"><GitCompare size={28} /></div>
      <h1 className="stub-title">Compare Documents</h1>
      <p className="stub-sub">This page is coming soon. The full comparison form will be built here.</p>
    </div>
  );
};

export default CompareForm;