/**
 * @file cascadeApiClient.ts
 * @description Strongly typed HTTP API client for CascadeOS backend REST endpoints (TASK-026, ARC-004).
 */

import type {
  SystemHealthResponse,
  UnifiedProjectState,
  ScenarioTriggerResponse,
  CascadeRecoveryPlan,
  Project,
  ProjectSummary,
  CascadeTask,
  TaskDependency,
  SupplierQuote,
  CreateCustomProjectPayload,
  UpsertTaskPayload,
  CreateDependencyPayload,
} from '../types/domain';

const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorData: any,
    message?: string
  ) {
    super(message || (typeof errorData?.message === 'string'
      ? `${typeof errorData?.error === 'string' ? errorData.error : `HTTP ${status}`}: ${errorData.message}`
      : typeof errorData?.error === 'string' ? errorData.error : `HTTP ${status}`));
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok && response.status !== 207) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}

export const cascadeApiClient = {
  /** Check live system connectivity (PayPal, Channel3, SQLite, LLM) */
  async getHealth(): Promise<SystemHealthResponse> {
    return request<SystemHealthResponse>('/health');
  },

  /** Bootstraps the 6 canonical tasks and live Sandbox references */
  async bootstrapProject(options?: {
    forceReset?: boolean;
    skipPayPal?: boolean;
    skipChannel3?: boolean;
  }): Promise<{ success: boolean; data: any }> {
    return request<{ success: boolean; data: any }>('/projects/bootstrap', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  /** Retrieves the unified project state tree */
  async getProjectState(projectId: string): Promise<UnifiedProjectState> {
    const response = await request<UnifiedProjectState & { activeRecoveryPlan?: CascadeRecoveryPlan | null }>(`/projects/${encodeURIComponent(projectId)}/state`);
    return {
      ...response,
      recoveryPlans: response.recoveryPlans ?? (response.activeRecoveryPlan ? [response.activeRecoveryPlan] : []),
      userApprovals: response.userApprovals ?? [],
    };
  },

  /** Fetches all persisted projects with summary KPIs (REQ-101) */
  async getProjects(): Promise<{ success: boolean; projects: ProjectSummary[] }> {
    return request<{ success: boolean; projects: ProjectSummary[] }>('/projects');
  },

  /** Creates a new custom project via AI Architect or Manual Structured builder (REQ-102) */
  async createCustomProject(payload: CreateCustomProjectPayload): Promise<{
    success: boolean;
    project: Project;
    tasks: CascadeTask[];
    dependencies: TaskDependency[];
    stats: {
      tasks_count: number;
      dependencies_count: number;
      paypal_invoices_created: number;
      channel3_quotes_created: number;
      initial_exposure_minor: number;
    };
  }> {
    return request('/projects/create-custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Creates a single task phase within a project (REQ-105) */
  async createTask(
    projectId: string,
    task: UpsertTaskPayload
  ): Promise<{
    success: boolean;
    task: CascadeTask;
    blastRadius?: any;
    policyResult?: any;
  }> {
    return request(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },

  /** Updates an existing task schedule, warehouse readiness, or pricing (REQ-105) */
  async updateTask(
    projectId: string,
    taskId: string,
    patch: UpsertTaskPayload
  ): Promise<{
    success: boolean;
    task: CascadeTask;
    blastRadius?: any;
    policyResult?: any;
  }> {
    return request(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /** Adds a finish-to-start dependency with topological cycle detection (REQ-105, SEC-101) */
  async createDependency(
    projectId: string,
    dependency: CreateDependencyPayload
  ): Promise<{
    success: boolean;
    dependency: TaskDependency;
    topologicalOrder: string[];
  }> {
    return request(`/projects/${encodeURIComponent(projectId)}/dependencies`, {
      method: 'POST',
      body: JSON.stringify(dependency),
    });
  },

  /** Deletes a task dependency (REQ-105) */
  async deleteDependency(
    projectId: string,
    dependencyId: string
  ): Promise<{
    success: boolean;
    deleted: string;
  }> {
    return request(`/projects/${encodeURIComponent(projectId)}/dependencies/${encodeURIComponent(dependencyId)}`, {
      method: 'DELETE',
    });
  },

  /** Provisions PayPal Sandbox invoice or Channel3 live price audit on an existing task (REQ-106) */
  async provisionTaskFinancials(
    projectId: string,
    taskId: string
  ): Promise<{
    success: boolean;
    task: CascadeTask;
    quotes?: SupplierQuote[];
    invoice?: any;
  }> {
    return request(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/provision-financials`, {
      method: 'POST',
    });
  },

  /** Executes 1-click live hackathon scenarios (REQ-018, PAT-101) */
  async triggerScenario(
    scenarioId: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C',
    options?: {
      forceRefresh?: boolean;
      projectId?: string;
      targetTaskId?: string;
    }
  ): Promise<ScenarioTriggerResponse> {
    return request<ScenarioTriggerResponse>(`/scenarios/${scenarioId}/trigger`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  /** Approves schedule reroute and triggers live PayPal partial unlock split (REQ-008, REQ-009) */
  async approvePlanAndSplit(
    planId: string,
    params: {
      approvedFingerprint: string;
      approverActor: string;
      customNudgeNote?: string;
    }
  ): Promise<{
    success: boolean;
    plan: CascadeRecoveryPlan;
    approval: any;
    invoiceId: string | null;
    minimumAmountDueMinor: number;
    qrCodeBase64: string | null;
    reminderSentAt: string | null;
    recipientViewUrl: string | null;
    nudgeMessage: string;
    tasks: any[];
  }> {
    return request(`/recovery-plans/${planId}/approve-schedule-and-split`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /** Creates a PayPal Orders v2 supplier purchase order (REQ-010) */
  async createPayPalSupplierOrder(params: {
    planId: string;
    taskId: string;
    quoteId: string;
    approvedFingerprint: string;
  }): Promise<{
    success: boolean;
    orderId: string;
    status: string;
    approveUrl: string | null;
    transactionRecord: any;
  }> {
    return request('/paypal/orders/create', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /** Captures the approved PayPal supplier purchase order (REQ-011) */
  async capturePayPalSupplierOrder(
    orderId: string,
    params: {
      taskId: string;
      planId?: string;
    }
  ): Promise<{
    success: boolean;
    orderId: string;
    captureId: string;
    status: string;
    task: any;
  }> {
    return request(`/paypal/orders/${orderId}/capture`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /** AG Studio Agent Framework SSE/JSON chat proxy (REQ-016) */
  async sendStudioAgentChat(params: {
    message: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    projectId?: string;
    activeTaskId?: string;
  }): Promise<{
    role: 'assistant';
    content: string;
    toolCalls?: any[];
  }> {
    return request('/studio-agent/chat', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};
