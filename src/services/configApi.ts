import axios from "axios";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { ComparisonTemplate } from "../types/ComparisonTemplate";
import { msalInstance, loginRequest } from "../authConfig";
import { getAppConfig } from "../appConfig";

// Single axios instance — baseURL set lazily from runtime config.
// Tenant is resolved server-side from the Bearer token.
const apiClient = axios.create();

// One redirect at a time — prevents a cascade when multiple concurrent requests all get 401.
let _loginRedirectInFlight = false;

// Attach the MSAL Bearer token to every request.
// Prefer getActiveAccount(); fall back to getAllAccounts()[0].
apiClient.interceptors.request.use(async (config) => {
  // Set baseURL from runtime config on every request
  config.baseURL = getAppConfig().apiBase;

  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) {
    console.warn("[Auth] No MSAL account found — request sent without token");
    return config;
  }

  try {
    const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
    config.headers = config.headers ?? {};
    config.headers["Authorization"] = `Bearer ${result.accessToken}`;
    config.headers["X-Aad-Tenant-Id"] = result.tenantId;
  } catch (error) {
    console.error("[Auth] acquireTokenSilent failed:", error);
    if (error instanceof InteractionRequiredAuthError && !_loginRedirectInFlight) {
      _loginRedirectInFlight = true;
      msalInstance.acquireTokenRedirect({ ...loginRequest, account });
    }
    // Proceed without token; the response interceptor handles the resulting 401.
  }

  return config;
});

// Catch 401s from the backend and redirect to login (once).
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("[Auth] 401 from backend:", error.response?.data);
      if (!_loginRedirectInFlight) {
        _loginRedirectInFlight = true;
        const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
        if (account) {
          msalInstance.acquireTokenRedirect({ ...loginRequest, account });
        } else {
          msalInstance.loginRedirect(loginRequest);
        }
      }
    }
    return Promise.reject(error);
  }
);

export const configApi = {

  // -----------------------------
  // DOCUMENT TYPES
  // -----------------------------

  async getDocumentTypes() {
    const res = await apiClient.get(`/api/GetDocumentTypes`);
    return res.data;
  },

  async createDocumentType(data: any) {
    const res = await apiClient.post(`/api/CreateDocumentType`, data);
    return res.data;
  },

  async updateDocumentType(id: string, data: any) {
    const res = await apiClient.put(`/api/UpdateDocumentType/${id}`, data);
    return res.data;
  },

  async deactivateDocumentType(id: string) {
    const res = await apiClient.put(`/api/DeactivateDocumentType/${id}`);
    return res.data;
  },

  // -----------------------------
  // TEMPLATES
  // -----------------------------

  async getAllTemplates() {
    const res = await apiClient.get(`/api/GetAllTemplates`);
    return res.data;
  },

  async getTemplate(id: string) {
    const res = await apiClient.get(`/api/GetTemplates?documentTypeId=${id}`);
    return res.data;
  },

  async createTemplate(data: ComparisonTemplate) {
    const res = await apiClient.post(`/api/CreateTemplate`, data);
    return res.data;
  },

  async updateTemplate(id: string, data: any) {

    const payload = {
      Id: id,
      Name: data.name,
      DocumentTypeId: data.documentTypeId,
      TemplateAiPrompt: data.templateAiPrompt,
      AiOutputStyleId: data.aiOutputStyleId
        ? Number(data.aiOutputStyleId)
        : null,
      IsDefault: data.isDefault,
      Version: data.version,
      IsActive: data.isActive
    };

    const res = await apiClient.put(`/api/UpdateTemplate`, payload);
    return res.data;
  },

  // -----------------------------
  // AI OUTPUT STYLES
  // -----------------------------

  async getChoiceOptions(entity: string, field: string) {
    const res = await apiClient.get(`/api/GetChoiceOptions?entity=${entity}&field=${field}`);
    return res.data;
  },

  // -----------------------------
  // TEMPLATE ATTRIBUTES
  // -----------------------------

  async getAllTemplateAttributes() {
    const res = await apiClient.get(`/api/GetAllTemplateAttributes`);
    return res.data;
  },

  async createTemplateAttribute(data: any) {
    const res = await apiClient.post(`/api/CreateTemplateAttribute`, data);
    return res.data;
  },

  async updateTemplateAttribute(data: any) {
    const res = await apiClient.put(`/api/UpdateTemplateAttribute`, data);
    return res.data;
  },

  // -----------------------------
  // RULES
  // -----------------------------

  async getRules() {
    const res = await apiClient.get(`/api/GetAllRules`);
    return res.data;
  },

  async getRuleLookups() {
    const res = await apiClient.get(`/api/GetRuleLookups`);
    return res.data;
  },

  async createRule(data: any) {
    const res = await apiClient.post(`/api/CreateRule`, data);
    return res.data;
  },

  async updateRule(data: any) {
    const res = await apiClient.put(`/api/UpdateRule`, data);
    return res.data;
  },

  async deleteRule(id: string) {
    const res = await apiClient.delete(`/api/DeleteRule?id=${id}`);
    return res.data;
  },

  // -----------------------------
  // AI INSIGHT PROFILES
  // -----------------------------

  async getAllAiInsightProfiles() {
    const res = await apiClient.get(`/api/GetAllAiInsightProfiles`);
    return res.data;
  },

  async createAiInsightProfile(data: any) {
    const res = await apiClient.post(`/api/CreateAiInsightProfile`, data);
    return res.data;
  },

  async updateAiInsightProfile(data: any) {
    const res = await apiClient.put(`/api/UpdateAiInsightProfile`, data);
    return res.data;
  },

  async deactivateAiInsightProfile(id: string) {
    const res = await apiClient.delete(`/api/DeactivateAiInsightProfile?id=${id}`);
    return res.data;
  },

  async getProfilesByTemplate(templateId: string) {
    const res = await apiClient.get(`/api/GetProfilesByTemplate?templateId=${templateId}`);
    return res.data;
  },

  async saveTemplateProfiles(templateId: string, profiles: { profileId: string; isDefault: boolean; displayOrder?: number }[]) {
    const res = await apiClient.post(`/api/SaveTemplateProfiles`, { templateId, profiles });
    return res.data;
  },

  // -----------------------------
  // INSIGHTS
  // -----------------------------

  async getInsightsDashboard(period = "7d") {
    const res = await apiClient.get(`/api/GetInsightsDashboard?period=${period}`);
    return res.data;
  },

  async getMyInsights(userEmail: string) {
    const res = await apiClient.get(`/api/GetMyInsights`, {
      headers: {
        "x-user-email": userEmail // ✅ keep this (custom header)
      }
    });
    return res.data;
  },

  async getAllInsights() {
    const res = await apiClient.get(`/api/GetAllInsights`);
    return res.data;
  },

  async toggleInsightActive(id: string, activate: boolean) {
    const res = await apiClient.put(`/api/DeactivateComparisonRun/${id}?activate=${activate}`);
    return res.data;
  },

  async getRunInsights(runId: string) {
    const res = await apiClient.get(`/api/GetRunInsights?runId=${runId}`);
    return res.data;
  },

  async getComparisonRunResults(runId: string) {
    const res = await apiClient.get(`/api/GetComparisonRunResults?comparisonRunId=${runId}`);
    return res.data;
  },

  // -----------------------------
  // LOOKUPS
  // -----------------------------

  async getTemplatesByDocumentType(documentTypeId: string) {
    const res = await apiClient.get(`/api/GetTemplatesByDocumentType`, {
      params: { documentTypeId }
    });
    return res.data;
  },

  async getTemplateAttributesByTemplate(templateId: string) {
    const res = await apiClient.get(`/api/GetTemplateAttributesByTemplate`, {
      params: { templateId }
    });
    return res.data;
  },

  async getRulesByTemplateAttribute(templateAttributeId: string) {
    const res = await apiClient.get(`/api/GetRulesByTemplateAttribute`, {
      params: { templateAttributeId }
    });
    return res.data;
  },

  // -----------------------------
  // EXPORT
  // -----------------------------

  async exportComparisonPdf(runId: string): Promise<{ blob: Blob; filename: string }> {
    const res = await apiClient.get(
      `/api/ExportComparisonPdf?comparisonRunId=${runId}`,
      { responseType: "blob" }
    );
    const disposition: string = res.headers["content-disposition"] ?? "";
    const match = disposition.match(/filename="?([^";\r\n]+)"?/i);
    const filename = match?.[1] ?? "ComparisonReport.pdf";
    return { blob: res.data, filename };
  },

  async getAttributeCategories() {
    const res = await apiClient.get(`/api/GetAttributeCategories`);
    return res.data;
  },

  // -----------------------------
  // TENANT SETTINGS
  // -----------------------------

  async getTenantSettings() {
    const res = await apiClient.get(`/api/GetTenantSettings`);
    return res.data;
  },

  async updateTenantSettings(data: any) {
    const res = await apiClient.put(`/api/UpdateTenantSettings`, data);
    return res.data;
  },

  async migrateExistingData() {
    const res = await apiClient.post(`/api/MigrateExistingData`);
    return res.data;
  },


    // ─────────────────────────────────────────────
  // PROMOTE DISCOVERED ATTRIBUTE TO TEMPLATE
  // One-click action from the "Also Discovered" UI
  // ─────────────────────────────────────────────
  async promoteAttributeToTemplate(templateId: string, attr: {
    name: string;
    description: string;
    dataType: string;
    categoryId: string | null;
    displayOrder: number;
  }) {
    // Build a camelCase key from the name
    const attributeKey = attr.name
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");

    const DATA_TYPE_MAP: Record<string, number> = {
      Text: 942870001, Number: 942870003, Date: 942870004,
      Currency: 942870000, Boolean: 942870002, Email: 942870001,
    };

    const res = await apiClient.post("/api/CreateTemplateAttribute", {
      name:             attr.name,
      displayName:      attr.name,
      attributeKey:     attributeKey || `field${Date.now()}`,
      aiExtractionHint: attr.description ?? "",
      categoryId:       attr.categoryId,
      expectedDataType: DATA_TYPE_MAP[attr.dataType] ?? 942870001,
      displayOrder:     attr.displayOrder,
      isMandatory:      false,
      templateId,
    });
    return res.data;
  },


};

