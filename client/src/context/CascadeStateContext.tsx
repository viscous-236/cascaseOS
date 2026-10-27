/**
 * @file CascadeStateContext.tsx
 * @description Centralized reactive state provider for CascadeOS (TASK-026, ARC-005).
 *
 * Implements:
 * - Real-time state synchronization across Bryntum Gantt, AG Studio, and Modals
 * - Active cross-filter management (`selectedTaskId`, `selectedReasonCode`)
 * - Toast notifications via sonner for scenario updates and sandbox events
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { cascadeApiClient, ApiError } from '../api/cascadeApiClient';
import { formatMinorToUSD, formatVariancePct } from '../utils/formatters';
import type {
  UnifiedProjectState,
  SystemHealthResponse,
  CascadeRecoveryPlan,
  CascadeTask,
  SupplierQuote,
  AuditEvent,
  ProjectSummary,
  CreateCustomProjectPayload,
  UpsertTaskPayload,
} from '../types/domain';

interface CascadeStateContextType {
  state: UnifiedProjectState | null;
  health: SystemHealthResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  loadError: string | null;
  refreshedAt: Date | null;
  activeScenario: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C' | null;
  selectedTaskId: string | null;
  selectedReasonCode: string | null;
  activePlan: CascadeRecoveryPlan | null;
  isApprovalModalOpen: boolean;
  isAuditDrawerOpen: boolean;
  isAgentChatOpen: boolean;
  theme: 'dark' | 'light';

  // Multi-Project & Interactive CRUD state
  projectsList: ProjectSummary[];
  activeProjectId: string;
  isNewProjectModalOpen: boolean;
  isTaskFinancialsDrawerOpen: boolean;
  drawerTaskId: string | null;

  // Actions
  refreshState: (silent?: boolean, targetProjectId?: string) => Promise<void>;
  fetchProjects: () => Promise<ProjectSummary[]>;
  switchProject: (projectId: string) => Promise<void>;
  openNewProjectModal: () => void;
  closeNewProjectModal: () => void;
  openTaskDrawer: (taskId: string) => void;
  closeTaskDrawer: () => void;
  createCustomProject: (payload: CreateCustomProjectPayload) => Promise<boolean>;
  updateTaskSchedule: (taskId: string, patch: UpsertTaskPayload) => Promise<boolean>;
  addNewTaskPhase: (task: UpsertTaskPayload) => Promise<boolean>;
  provisionTaskFinancials: (taskId: string) => Promise<boolean>;

  checkHealth: () => Promise<void>;
  bootstrapProject: (forceReset?: boolean) => Promise<void>;
  triggerScenario: (scenarioId: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C') => Promise<void>;
  selectTask: (taskId: string | null) => void;
  selectReasonCode: (code: string | null) => void;
  openApprovalModal: (plan?: CascadeRecoveryPlan) => void;
  closeApprovalModal: () => void;
  setIsAuditDrawerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsAgentChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  approvePlan: (approverActor: string, customNote?: string) => Promise<boolean>;
  lastNotification: {
    invoiceId: string | null;
    minimumAmountDueMinor: number;
    qrCodeBase64: string | null;
    reminderSentAt: string | null;
    recipientViewUrl: string | null;
    nudgeMessage: string;
  } | null;
  toggleTheme: () => void;
}

const CascadeStateContext = createContext<CascadeStateContextType | null>(null);

export function CascadeStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UnifiedProjectState | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const requestSequence = useRef(0);
  const [activeScenario, setActiveScenario] = useState<
    'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C' | null
  >(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedReasonCode, setSelectedReasonCode] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<CascadeRecoveryPlan | null>(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState<boolean>(false);
  const [isAgentChatOpen, setIsAgentChatOpen] = useState<boolean>(false);

  // Multi-tenant project switcher and drawer states
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem('cascade_active_project_id') || '';
    } catch {
      return '';
    }
  });
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState<boolean>(false);
  const projectIdRef = useRef(activeProjectId);
  projectIdRef.current = activeProjectId;
  const [isTaskFinancialsDrawerOpen, setIsTaskFinancialsDrawerOpen] = useState<boolean>(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [lastNotification, setLastNotification] = useState<CascadeStateContextType['lastNotification']>(null);

  // Theme state: default dark, persists in localStorage, syncs with document.documentElement
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('cascade_theme');
      return saved === 'light' || saved === 'dark' ? saved : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('cascade_theme', theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const h = await cascadeApiClient.getHealth();
      setHealth(h);
    } catch (err) {
      console.warn('Health check degraded:', err);
    }
  }, []);

  const fetchProjects = useCallback(async (): Promise<ProjectSummary[]> => {
    try {
      const res = await cascadeApiClient.getProjects();
      if (res.success && Array.isArray(res.projects)) {
        setProjectsList(res.projects);
        return res.projects;
      }
    } catch (err) {
      console.warn('Failed to load projects list:', err);
      setLoadError('Could not load projects. Check the server connection and try again.');
    }
    return [];
  }, []);

  const refreshState = useCallback(async (silent = false, targetProjectId?: string) => {
    const pId = targetProjectId || projectIdRef.current;
    const sequence = ++requestSequence.current;
    if (!silent) setIsRefreshing(true);
    if (!pId) {
      setIsLoading(false);
      if (!silent) setIsRefreshing(false);
      return;
    }
    try {
      const s = await cascadeApiClient.getProjectState(pId);
      if (sequence !== requestSequence.current) return;
      setState(s);
      setLoadError(null);
      setRefreshedAt(new Date());

      // Auto-locate latest proposed or active recovery plan
      const latestProposed = s.recoveryPlans?.find((p) => p.status === 'PROPOSED');
      setActivePlan(latestProposed ?? s.recoveryPlans?.find((p) => p.status === 'APPROVED') ?? null);
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      setLoadError('Could not synchronize this project. Retry to get the latest milestone and payment data.');
      toast.error('Failed to synchronize project state', {
        description: String(err),
      });
    } finally {
      if (sequence === requestSequence.current) {
        if (!silent) setIsRefreshing(false);
        setIsLoading(false);
      }
    }
  }, []);

  const switchProject = useCallback(
    async (newProjectId: string) => {
      if (newProjectId === activeProjectId) return;
      setIsRefreshing(true);
      setActiveProjectId(newProjectId);
      projectIdRef.current = newProjectId;
      setState(null);
      setSelectedTaskId(null);
      setDrawerTaskId(null);
      setIsTaskFinancialsDrawerOpen(false);
      setIsApprovalModalOpen(false);
      setSelectedReasonCode(null);
      setActiveScenario(null);
      setLastNotification(null);
      setActivePlan(null);
      try {
        localStorage.setItem('cascade_active_project_id', newProjectId);
      } catch {
        // Ignore
      }
      await refreshState(false, newProjectId);
      await fetchProjects();
    },
    [activeProjectId, refreshState, fetchProjects]
  );

  const openNewProjectModal = useCallback(() => setIsNewProjectModalOpen(true), []);
  const closeNewProjectModal = useCallback(() => setIsNewProjectModalOpen(false), []);

  const openTaskDrawer = useCallback((taskId: string) => {
    setDrawerTaskId(taskId);
    setSelectedTaskId(taskId);
    setIsTaskFinancialsDrawerOpen(true);
  }, []);

  const closeTaskDrawer = useCallback(() => {
    setIsTaskFinancialsDrawerOpen(false);
  }, []);

  // Initial load
  useEffect(() => {
    let mounted = true;
      const init = async () => {
        void checkHealth();
      const projects = await fetchProjects();
      const savedProjectId = (() => {
        try { return localStorage.getItem('cascade_active_project_id') || ''; } catch { return ''; }
      })();
      const targetProjectId = projects.find((project) => project.project_id === savedProjectId)?.project_id ?? projects[0]?.project_id ?? '';
      if (targetProjectId) {
        setActiveProjectId(targetProjectId);
        projectIdRef.current = targetProjectId;
        try { localStorage.setItem('cascade_active_project_id', targetProjectId); } catch { /* browser storage optional */ }
        if (mounted) await refreshState(false, targetProjectId);
      } else if (mounted) {
        setIsLoading(false);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, [checkHealth, fetchProjects, refreshState]);

  const bootstrapProject = useCallback(
    async (forceReset = true) => {
      setIsRefreshing(true);
      const toastId = toast.loading('Bootstrapping live Sandbox project...', {
        description: 'Seeding 6 tasks, baseline quotes, and verifying PayPal Sandbox status',
      });
      try {
        await cascadeApiClient.bootstrapProject({
          forceReset,
          skipPayPal: false,
          skipChannel3: false,
        });
        await refreshState(true, activeProjectId);
        await fetchProjects();
        await checkHealth();
        toast.success('Project bootstrapped successfully', {
          id: toastId,
          description: 'Tasks initialized with live PayPal Sandbox and Channel3 bindings',
        });
      } catch (err) {
        toast.error('Project bootstrap encountered an issue', {
          id: toastId,
          description: String(err),
        });
      } finally {
        setIsRefreshing(false);
      }
    },
    [refreshState, activeProjectId, fetchProjects, checkHealth]
  );

  const createCustomProject = useCallback(
    async (payload: CreateCustomProjectPayload): Promise<boolean> => {
      setIsRefreshing(true);
      const toastId = toast.loading('Architecting custom project...', {
        description: 'Validating DAG, generating phases, and preparing live Sandboxes',
      });
      try {
        const res = await cascadeApiClient.createCustomProject(payload);
        if (res.success && res.project) {
          toast.success(`Project "${res.project.name}" Created!`, {
            id: toastId,
            description: `${res.stats.tasks_count} phases built with ${res.stats.paypal_invoices_created} live PayPal invoices & ${res.stats.channel3_quotes_created} Channel3 audits.`,
          });
          setActiveProjectId(res.project.project_id);
          projectIdRef.current = res.project.project_id;
          setSelectedTaskId(null);
          setSelectedReasonCode(null);
          setActivePlan(null);
          setActiveScenario(null);
          setLastNotification(null);
          try {
            localStorage.setItem('cascade_active_project_id', res.project.project_id);
          } catch {
            // Ignore
          }
          await fetchProjects();
          await refreshState(false, res.project.project_id);
          setIsNewProjectModalOpen(false);
          return true;
        }
        toast.error('Failed to create project', { id: toastId });
        return false;
      } catch (err: any) {
        const msg = err?.errorData?.error || err?.message || String(err);
        toast.error('Project Creation Failed', {
          id: toastId,
          description: msg,
        });
        return false;
      } finally {
        setIsRefreshing(false);
      }
    },
    [fetchProjects, refreshState]
  );

  const updateTaskSchedule = useCallback(
    async (taskId: string, patch: UpsertTaskPayload): Promise<boolean> => {
      try {
        const res = await cascadeApiClient.updateTask(activeProjectId, taskId, patch);
        if (res.success) {
          await refreshState(true);
          toast.success('Task schedule synchronized', {
            description: `Updated "${res.task.name}" (${taskId})`,
            duration: 2000,
          });
          return true;
        }
        return false;
      } catch (err: any) {
        const msg = err?.errorData?.error || err?.message || String(err);
        toast.error('Failed to update task schedule', {
          description: msg,
        });
        return false;
      }
    },
    [activeProjectId, refreshState]
  );

  const addNewTaskPhase = useCallback(
    async (task: UpsertTaskPayload): Promise<boolean> => {
      setIsRefreshing(true);
      const toastId = toast.loading('Adding new phase to project...', {
        description: `Creating phase "${task.name || 'New Phase'}" in ${activeProjectId}`,
      });
      try {
        const res = await cascadeApiClient.createTask(activeProjectId, task);
        if (res.success) {
          await refreshState(true);
          await fetchProjects();
          toast.success('Phase Added Successfully', {
            id: toastId,
            description: `Phase "${res.task.name}" added to timeline.`,
          });
          return true;
        }
        toast.error('Failed to add phase', { id: toastId });
        return false;
      } catch (err: any) {
        const msg = err?.errorData?.error || err?.message || String(err);
        toast.error('Failed to add phase', {
          id: toastId,
          description: msg,
        });
        return false;
      } finally {
        setIsRefreshing(false);
      }
    },
    [activeProjectId, refreshState, fetchProjects]
  );

  const provisionTaskFinancials = useCallback(
    async (taskId: string): Promise<boolean> => {
      const toastId = toast.loading('Provisioning Live Task Financials...', {
        description: 'Querying Channel3 Product Graph and generating PayPal Sandbox invoice',
      });
      try {
        const res = await cascadeApiClient.provisionTaskFinancials(activeProjectId, taskId);
        if (res.success) {
          await refreshState(true);
          await fetchProjects();
          toast.success('Financials Provisioned!', {
            id: toastId,
            description: `Task "${res.task.name}" refreshed with live Channel3 quotes & PayPal billing.`,
          });
          return true;
        }
        toast.error('Provisioning failed', { id: toastId });
        return false;
      } catch (err: any) {
        const msg = err?.errorData?.error || err?.message || String(err);
        toast.error('Provisioning Failed', {
          id: toastId,
          description: msg,
        });
        return false;
      }
    },
    [activeProjectId, refreshState, fetchProjects]
  );

  const triggerScenario = useCallback(
    async (scenarioId: 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C') => {
      setIsRefreshing(true);
      setActiveScenario(scenarioId);

      const scenarioLabels = {
        SCENARIO_A: 'Scenario A: Overdue Invoice & Schedule Reroute',
        SCENARIO_B: 'Scenario B: Vendor Price-Creep BLOCK & Channel3 Discovery',
        SCENARIO_C: 'Scenario C: Adversarial Dependency Hard BLOCK',
      };

      const toastId = toast.loading(`Triggering ${scenarioLabels[scenarioId]}...`, {
        description: 'Executing DAG blast radius, deterministic policy engine, and live APIs',
      });

      try {
        const result = await cascadeApiClient.triggerScenario(scenarioId, {
          projectId: activeProjectId,
          forceRefresh: true,
        });
        await refreshState(true);

        if (scenarioId === 'SCENARIO_A' && result.plan) {
          setActivePlan(result.plan);
          setIsApprovalModalOpen(true);
           toast.warning(`Scenario A triggered: ${result.blastRadius ? formatMinorToUSD(result.blastRadius.total_exposure_minor) : 'recovery plan ready'} exposure`, {
             id: toastId,
             description: result.blastRadius
               ? `${result.blastRadius.idle_crew_hours} idle hours at risk. A live reroute keeps the active project moving.`
               : 'A live reroute keeps the active project moving.',
          });
        } else if (scenarioId === 'SCENARIO_B') {
          if (result.channel3Proposed?.plan) {
            setActivePlan(result.channel3Proposed.plan);
            setIsApprovalModalOpen(true);
          }
           toast.info(`Scenario B triggered: ${result.incumbentBlocked ? formatVariancePct(result.incumbentBlocked.observed.variance_pct) : 'supplier'} defense`, {
             id: toastId,
             description: result.channel3Proposed
               ? `Live Channel3 alternative found with ${formatMinorToUSD(result.channel3Proposed.quote.savings_vs_incumbent_minor)} observed savings.`
               : 'Supplier policy evaluation completed for active project.',
          });
        } else if (scenarioId === 'SCENARIO_C') {
          toast.error('Scenario C Triggered: Adversarial Violation Hard BLOCKED', {
            id: toastId,
            description:
              'Violated finish-to-start dependency & unknown costs. Fail-closed defense halted execution.',
          });
          setIsAuditDrawerOpen(true);
        }
      } catch (err) {
        toast.error(`Error executing ${scenarioId}`, {
          id: toastId,
          description: String(err),
        });
      } finally {
        setIsRefreshing(false);
      }
    },
    [refreshState, activeProjectId]
  );

  const selectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
  }, []);

  const selectReasonCode = useCallback((code: string | null) => {
    setSelectedReasonCode((prev) => (prev === code ? null : code));
  }, []);

  const openApprovalModal = useCallback((plan?: CascadeRecoveryPlan) => {
    if (plan) setActivePlan(plan);
    setIsApprovalModalOpen(true);
  }, []);

  const closeApprovalModal = useCallback(() => {
    setIsApprovalModalOpen(false);
  }, []);

  const approvePlan = useCallback(
    async (approverActor: string, customNote?: string): Promise<boolean> => {
      if (!activePlan) {
        toast.error('No active recovery plan selected for approval');
        return false;
      }

      const toastId = toast.loading('Submitting cryptographic approval...', {
        description: 'Verifying SHA-256 state fingerprint & splitting PayPal Sandbox invoice',
      });

      try {
        const res = await cascadeApiClient.approvePlanAndSplit(activePlan.plan_id, {
          approvedFingerprint: activePlan.state_fingerprint,
          approverActor,
          customNudgeNote: customNote,
        });

        setLastNotification({
          invoiceId: res.invoiceId,
          minimumAmountDueMinor: res.minimumAmountDueMinor,
          qrCodeBase64: res.qrCodeBase64,
          reminderSentAt: res.reminderSentAt,
          recipientViewUrl: res.recipientViewUrl,
          nudgeMessage: res.nudgeMessage,
        });
        await refreshState(true);
        closeApprovalModal();

        toast.success('Recovery Plan Approved & Schedule Rerouted!', {
          id: toastId,
          description: `Promoted task is active. PayPal partial materials unlock QR code generated.`,
        });

        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error('Approval Rejected: State Fingerprint Mismatch (409)', {
            id: toastId,
            description:
              'Underlying project state changed before approval sign-off. STALE_FINGERPRINT_APPROVAL.',
          });
        } else {
          toast.error('Approval failed', {
            id: toastId,
            description: String(err),
          });
        }
        return false;
      }
    },
    [activePlan, refreshState, closeApprovalModal]
  );

  return (
    <CascadeStateContext.Provider
      value={{
        state,
        health,
        isLoading,
        isRefreshing,
        loadError,
        refreshedAt,
        activeScenario,
        selectedTaskId,
        selectedReasonCode,
        activePlan,
        isApprovalModalOpen,
        isAuditDrawerOpen,
        isAgentChatOpen,
        theme,
        projectsList,
        activeProjectId,
        isNewProjectModalOpen,
        isTaskFinancialsDrawerOpen,
        drawerTaskId,
        refreshState,
        fetchProjects,
        switchProject,
        openNewProjectModal,
        closeNewProjectModal,
        openTaskDrawer,
        closeTaskDrawer,
        createCustomProject,
        updateTaskSchedule,
        addNewTaskPhase,
        provisionTaskFinancials,
        lastNotification,
        checkHealth,
        bootstrapProject,
        triggerScenario,
        selectTask,
        selectReasonCode,
        openApprovalModal,
        closeApprovalModal,
        setIsAuditDrawerOpen,
        setIsAgentChatOpen,
        approvePlan,
        toggleTheme,
      }}
    >
      {children}
    </CascadeStateContext.Provider>
  );
}

export function useCascadeState(): CascadeStateContextType {
  const context = useContext(CascadeStateContext);
  if (!context) {
    throw new Error('useCascadeState must be used within a CascadeStateProvider');
  }
  return context;
}
