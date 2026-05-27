import { useEffect, useState } from "react";
import { configApi } from "../services/configApi";

export function useConfigData() {
  const [documentTypes, setDocumentTypes] = useState([]);
  const [aiProfiles, setAiProfiles] = useState([]);

  useEffect(() => {
    loadInitial();
  }, []);

  const loadInitial = async () => {
    const [docs, profiles] = await Promise.all([
      configApi.getDocumentTypes(),
      configApi.getAllAiInsightProfiles()
    ]);

    setDocumentTypes(docs);
    setAiProfiles(profiles);
  };

  const loadTemplates = async (documentTypeId: string) => {
    return await configApi.getTemplate(documentTypeId);
  };

  return {
    documentTypes,
    aiProfiles,
    loadTemplates
  };
}