import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";

const ScoredEvaluationForm: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="stub-page">
      <button className="stub-back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={15} /> Back
      </button>
      <div className="stub-icon stub-icon--purple"><Star size={28} /></div>
      <h1 className="stub-title">Scored Evaluation</h1>
      <p className="stub-sub">This page is coming soon. The scored evaluation form will be built here.</p>
    </div>
  );
};

export default ScoredEvaluationForm;
