"use client";

import ConfigTabs from "@/components/ui/ConfigTabs";
import { SucursalTab, ProductosTab, EquipoTab, SucursalesTab, AccesoTab } from "./tabs";
import type { Employee, Category, Branch, PricingMode, FiscalEnvironment, TicketPrintMode, Subscription } from "./types";

interface ConfigTabsContainerProps {
  branchId: string;
  isOwner: boolean;
  currentBranch: Branch | null;
  loadingCurrentBranch: boolean;
  employees: Employee[];
  loadingEmployees: boolean;
  subscription: { status: string; managementUrl: string | null } | null;
  loadingSubscription: boolean;
  creatingSubscription: boolean;
  subscriptionError: string | null;
  cancelingSubscription: boolean;
  cancelModalOpen: boolean;
  branches: Branch[];
  loadingBranches: boolean;
  branchModal: boolean;
  categories: Category[];
  loadingCategories: boolean;
  categoryModal: "new" | Category | null;
  accessEntryUrl: string;
  mpSetupLoading: boolean;
  mpSetupError: string | null;
  // Handlers
  setCancelModalOpen: (v: boolean) => void;
  setBranchModal: (v: boolean) => void;
  setCategoryModal: (v: "new" | Category | null) => void;
  setEmployeeModal: (v: "new" | Employee | null) => void;
  handleCreateSubscription: () => Promise<void>;
  handleCancelSubscription: () => Promise<void>;
  handleBranchModalClose: () => void;
  handleBranchModalSave: () => Promise<void>;
  handleCategorySave: (data: { name: string; color: string }) => Promise<void>;
  handleCategoryDelete: (categoryId: string) => Promise<void>;
  handleCategoryModalClose: () => void;
  handleCategoryModalSave: () => Promise<void>;
  handleEmployeeModalClose: () => void;
  handleEmployeeModalSave: () => void;
  handleMpSetupPos: () => Promise<void>;
  handleMpDisconnect: () => Promise<void>;
  copyAccessValue: (value: string, message: string) => Promise<void>;
  handleGenerateAccessKey: () => Promise<void>;
  // Sucursal Tab Props
  editBranchName: string;
  editBranchAddress: string;
  editBranchPhone: string;
  editLogoUrl: string | null;
  uploadingLogo: boolean;
  savingBranch: boolean;
  branchSettingsError: string | null;
  branchSettingsMessage: string | null;
  ticketShowLogo: boolean;
  ticketShowAddress: boolean;
  ticketShowPhone: boolean;
  ticketShowFooterText: boolean;
  ticketFooterText: string;
  ticketPrintMode: TicketPrintMode;
  loadingTicketSettings: boolean;
  savingTicketSettings: boolean;
  ticketSettingsError: string | null;
  ticketSettingsMessage: string | null;
  pricingMode: PricingMode;
  loadingExpirySettings: boolean;
  savingPricingSettings: boolean;
  pricingSettingsError: string | null;
  pricingSettingsMessage: string | null;
  expiryAlertDays: string;
  savingExpirySettings: boolean;
  expirySettingsError: string | null;
  expirySettingsMessage: string | null;
  allowNegativeStock: boolean;
  savingStockRules: boolean;
  stockRulesError: string | null;
  stockRulesMessage: string | null;
  fiscalEnvironment: FiscalEnvironment;
  fiscalSettingsActive: boolean;
  fiscalMinAmount: number;
  loadingFiscalSettings: boolean;
  savingFiscalSettings: boolean;
  fiscalSettingsError: string | null;
  fiscalSettingsMessage: string | null;
  setEditBranchName: (v: string) => void;
  setEditBranchAddress: (v: string) => void;
  setEditBranchPhone: (v: string) => void;
  setEditLogoUrl: (v: string | null) => void;
  setUploadingLogo: (v: boolean) => void;
  setTicketShowLogo: (v: boolean) => void;
  setTicketShowAddress: (v: boolean) => void;
  setTicketShowPhone: (v: boolean) => void;
  setTicketShowFooterText: (v: boolean) => void;
  setTicketFooterText: (v: string) => void;
  setTicketPrintMode: (v: TicketPrintMode) => void;
  setPricingMode: (v: PricingMode) => void;
  setExpiryAlertDays: (v: string) => void;
  setAllowNegativeStock: (v: boolean) => void;
  setFiscalEnvironment: (v: FiscalEnvironment) => void;
  setFiscalSettingsActive: (v: boolean) => void;
  setFiscalMinAmount: (v: number) => void;
  handleSaveBranchSettings: () => Promise<void>;
  handleSaveTicketSettings: () => Promise<void>;
  handleSavePricingSettings: () => Promise<void>;
  handleSaveExpirySettings: () => Promise<void>;
  handleSaveStockRules: () => Promise<void>;
  handleSaveFiscalSettings: () => Promise<void>;
  openTicketPreview: (data: any) => void;
}

export default function ConfigTabsContainer(props: ConfigTabsContainerProps) {
  const {
    branchId,
    isOwner,
    currentBranch,
    loadingCurrentBranch,
    employees,
    loadingEmployees,
    subscription,
    loadingSubscription,
    creatingSubscription,
    subscriptionError,
    cancelingSubscription,
    cancelModalOpen,
    branches,
    loadingBranches,
    branchModal,
    categories,
    loadingCategories,
    categoryModal,
    accessEntryUrl,
    mpSetupLoading,
    mpSetupError,
  } = props;

  return (
    <ConfigTabs
      tabs={[
        {
          id: "sucursal",
          label: "Sucursal",
          icon: "🏪",
          content: (
            <SucursalTab {...props} />
          ),
        },
        {
          id: "productos",
          label: "Productos",
          icon: "📦",
          content: (
            <ProductosTab
              branchId={branchId}
              isOwner={isOwner}
              currentBranch={currentBranch}
              loadingCurrentBranch={loadingCurrentBranch}
              categories={categories}
              loadingCategories={loadingCategories}
              categoryModal={categoryModal}
              handleMpSetupPos={props.handleMpSetupPos}
              handleMpDisconnect={props.handleMpDisconnect}
              setCategoryModal={props.setCategoryModal}
              handleCategorySave={props.handleCategorySave}
              handleCategoryDelete={props.handleCategoryDelete}
            />
          ),
        },
        {
          id: "equipo",
          label: "Equipo",
          icon: "👥",
          content: (
            <EquipoTab
              branchId={branchId}
              isOwner={isOwner}
              employees={employees}
              loadingEmployees={loadingEmployees}
              subscription={subscription}
              loadingSubscription={loadingSubscription}
              creatingSubscription={creatingSubscription}
              subscriptionError={subscriptionError}
              cancelingSubscription={cancelingSubscription}
              cancelModalOpen={cancelModalOpen}
              handleCreateSubscription={props.handleCreateSubscription}
              handleCancelSubscription={props.handleCancelSubscription}
              setCancelModalOpen={props.setCancelModalOpen}
              setEmployeeModal={props.setEmployeeModal}
            />
          ),
        },
        {
          id: "sucursal-multiple",
          label: "Sucursales",
          icon: "🏬",
          content: (
            <SucursalesTab
              branchId={branchId}
              isOwner={isOwner}
              branches={branches}
              loadingBranches={loadingBranches}
              branchModal={branchModal}
              pricingMode={props.pricingMode}
              setBranchModal={props.setBranchModal}
              handleBranchModalClose={props.handleBranchModalClose}
              handleBranchModalSave={props.handleBranchModalSave}
            />
          ),
        },
        {
          id: "acceso",
          label: "Acceso",
          icon: "🔑",
          content: (
            <AccesoTab
              branchId={branchId}
              currentBranch={currentBranch}
              accessEntryUrl={accessEntryUrl}
              copyAccessValue={props.copyAccessValue}
              handleGenerateAccessKey={props.handleGenerateAccessKey}
            />
          ),
        },
      ]}
    />
  );
}
