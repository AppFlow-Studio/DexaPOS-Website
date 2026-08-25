'use client';

import { useState, useEffect } from 'react';
import {
  useLoyaltyPrograms,
  useCreateLoyaltyProgram,
  useUpdateLoyaltyProgram,
  useToggleLoyaltyProgram,
  useDeleteLoyaltyProgram,
  usePromotions,
  useCreatePromotion,
  useUpdatePromotion,
  useTogglePromotion,
  useDeletePromotion,
} from './hooks/useLoyaltyProgram';
import { ProgramCard } from './components/ProgramCard';
import { PromotionCard } from './components/PromotionCard';
import { ProgramWizard } from './components/ProgramWizard';
import { PromotionDialog } from './components/PromotionDialog';
import { ProgramAnalyticsSheet } from './components/ProgramAnalyticsSheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Plus, AlertTriangle, Loader2, Gift, Sparkles } from 'lucide-react';
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.';
import { useClerkOrgId, useLocationStore } from '../../hooks/useLocationScoped';
import { GetMenuItems } from '../../actions/menu-items';
import type { LoyaltyProgram, Promotion } from '../../actions/loyalty-programs';
import { useGatedLocation } from '@/stores/location-store';
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from '@/components/dashboard/shell';

export default function LoyaltySettingsPage() {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useGatedLocation();

  // Loyalty programs
  const {
    data: programs = [],
    isLoading: programsLoading,
    isError: programsError,
    error: programsErrorObj,
  } = useLoyaltyPrograms(clerkOrgId);

  // Promotions
  const {
    data: promotions = [],
    isLoading: promotionsLoading,
    isError: promotionsError,
    error: promotionsErrorObj,
  } = usePromotions(clerkOrgId);

  // Mutations
  const createProgramMutation = useCreateLoyaltyProgram();
  const updateProgramMutation = useUpdateLoyaltyProgram();
  const toggleProgramMutation = useToggleLoyaltyProgram();
  const deleteProgramMutation = useDeleteLoyaltyProgram();

  const createPromotionMutation = useCreatePromotion();
  const updatePromotionMutation = useUpdatePromotion();
  const togglePromotionMutation = useTogglePromotion();
  const deletePromotionMutation = useDeletePromotion();

  // State
  const [mounted, setMounted] = useState(false);
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [isProgramWizardOpen, setIsProgramWizardOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [programToDelete, setProgramToDelete] = useState<LoyaltyProgram | null>(null);
  const [analyticsProgram, setAnalyticsProgram] = useState<LoyaltyProgram | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [promotionToDelete, setPromotionToDelete] = useState<Promotion | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch menu items on mount
  useEffect(() => {
    if (clerkOrgId) {
      GetMenuItems(clerkOrgId).then((items) => {
        setMenuItems(
          items.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: item.price || 0,
          }))
        );
      });
    }
  }, [clerkOrgId]);

  // Filter programs and promotions by location
  const filteredPrograms = programs.filter((program) => {
    // If location_ids is null or empty, program applies to all locations
    if (!program.location_ids || program.location_ids.length === 0) {
      return true;
    }
    // Otherwise, only show if selected location is in the program's location_ids
    if (selectedLocationId === 'all') {
      return true; // Show all programs when "all locations" is selected
    }
    return program.location_ids.includes(selectedLocationId);
  });

  const filteredPromotions = promotions.filter((promotion) => {
    // If location_ids is null or empty, promotion applies to all locations
    if (!promotion.location_ids || promotion.location_ids.length === 0) {
      return true;
    }
    // Otherwise, only show if selected location is in the promotion's location_ids
    if (selectedLocationId === 'all') {
      return true; // Show all promotions when "all locations" is selected
    }
    return promotion.location_ids.includes(selectedLocationId);
  });

  // Program handlers
  const handleEditProgram = (program: LoyaltyProgram) => {
    setEditingProgram(program);
    setIsProgramWizardOpen(true);
  };

  const handleAnalyticsProgram = (program: LoyaltyProgram) => {
    setAnalyticsProgram(program);
    setIsAnalyticsOpen(true);
  };

  const handleDeleteProgramClick = (program: LoyaltyProgram) => {
    setProgramToDelete(program);
  };

  const handleConfirmDeleteProgram = async () => {
    if (!programToDelete || !clerkOrgId) return;
    try {
      await deleteProgramMutation.mutateAsync({
        clerkOrgId,
        programId: programToDelete.id,
      });
      setProgramToDelete(null);
    } catch {
      // Error handled in mutation
    }
  };

  const handleToggleProgram = async (programId: string, isActive: boolean) => {
    if (!clerkOrgId) return;
    try {
      await toggleProgramMutation.mutateAsync({
        clerkOrgId,
        programId,
        isActive,
      });
    } catch {
      // Error handled in mutation
    }
  };

  const handleCreateOrUpdateProgram = async (data: any) => {
    if (!clerkOrgId) return;
    try {
      if (editingProgram) {
        await updateProgramMutation.mutateAsync({
          clerkOrgId,
          programId: editingProgram.id,
          input: data,
        });
      } else {
        await createProgramMutation.mutateAsync({
          clerkOrgId,
          input: data,
        });
      }
      setEditingProgram(null);
      setIsProgramWizardOpen(false);
    } catch {
      // Error handled in mutation
    }
  };

  // Promotion handlers
  const handleEditPromotion = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setIsPromotionDialogOpen(true);
  };

  const handleDeletePromotionClick = (promotion: Promotion) => {
    setPromotionToDelete(promotion);
  };

  const handleConfirmDeletePromotion = async () => {
    if (!promotionToDelete || !clerkOrgId) return;
    try {
      await deletePromotionMutation.mutateAsync({
        clerkOrgId,
        promotionId: promotionToDelete.id,
      });
      setPromotionToDelete(null);
    } catch {
      // Error handled in mutation
    }
  };

  const handleTogglePromotion = async (promotionId: string, isActive: boolean) => {
    if (!clerkOrgId) return;
    try {
      await togglePromotionMutation.mutateAsync({
        clerkOrgId,
        promotionId,
        isActive,
      });
    } catch {
      // Error handled in mutation
    }
  };

  const handleCreateOrUpdatePromotion = async (data: any) => {
    if (!clerkOrgId) return;
    try {
      if (editingPromotion) {
        await updatePromotionMutation.mutateAsync({
          clerkOrgId,
          promotionId: editingPromotion.id,
          input: data,
        });
      } else {
        await createPromotionMutation.mutateAsync({
          clerkOrgId,
          input: data,
        });
      }
      setEditingPromotion(null);
      setIsPromotionDialogOpen(false);
    } catch {
      // Error handled in mutation
    }
  };

  if (!mounted) {
    return (
      <PageShell>
        <PageHeader
          title="Loyalty & rewards"
          subtitle="Manage loyalty programs and promotions."
          indicator={
            <LocationIndicator
              isAllLocations={!selectedLocationId || selectedLocationId === 'all'}
              locationName={selectedLocation?.name}
            />
          }
        />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Loyalty & rewards"
        subtitle="Create programs and promotions that reward returning customers."
        indicator={
          <LocationIndicator
            isAllLocations={!selectedLocationId || selectedLocationId === 'all'}
            locationName={selectedLocation?.name}
          />
        }
      />

      {/* LOYALTY PROGRAMS SECTION */}
      <Panel>
        <PanelSection
          icon={Gift}
          label="Your Programs"
          caption="Create and manage loyalty programs for your customers."
          action={
            <Button
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => {
                setEditingProgram(null);
                setIsProgramWizardOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Program
            </Button>
          }
        >
          {programsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : programsError ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium text-foreground">Failed to load programs</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {programsErrorObj instanceof Error ? programsErrorObj.message : 'An error occurred'}
              </p>
            </div>
          ) : filteredPrograms.length === 0 ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <Gift className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">
                {programs.length === 0 ? 'No loyalty programs yet' : 'No programs for this location'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {programs.length === 0
                  ? 'Create your first loyalty program to start rewarding customers for their visits.'
                  : 'This location has no active programs. Create a new one or adjust location settings.'}
              </p>
              <Button
                className="mt-4 h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => {
                  setEditingProgram(null);
                  setIsProgramWizardOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create Program
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPrograms.map((program) => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  onEdit={handleEditProgram}
                  onDelete={handleDeleteProgramClick}
                  onToggle={handleToggleProgram}
                  onAnalytics={handleAnalyticsProgram}
                  isToggling={toggleProgramMutation.isPending}
                />
              ))}
            </div>
          )}
        </PanelSection>
      </Panel>

      {/* PROMOTIONS SECTION */}
      <Panel>
        <PanelSection
          icon={Sparkles}
          label="Promotions"
          caption="Run time-limited and automated promotions."
          action={
            <Button
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => {
                setEditingPromotion(null);
                setIsPromotionDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Promotion
            </Button>
          }
        >
          {promotionsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : promotionsError ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium text-foreground">Failed to load promotions</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {promotionsErrorObj instanceof Error ? promotionsErrorObj.message : 'An error occurred'}
              </p>
            </div>
          ) : filteredPromotions.length === 0 ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">
                {promotions.length === 0 ? 'No promotions yet' : 'No promotions for this location'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {promotions.length === 0
                  ? 'Create your first promotion to drive customer engagement with special offers.'
                  : 'This location has no active promotions. Create a new one or adjust location settings.'}
              </p>
              <Button
                className="mt-4 h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => {
                  setEditingPromotion(null);
                  setIsPromotionDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create Promotion
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPromotions.map((promotion) => (
                <PromotionCard
                  key={promotion.id}
                  promotion={promotion}
                  onEdit={handleEditPromotion}
                  onDelete={handleDeletePromotionClick}
                  onToggle={handleTogglePromotion}
                  isToggling={togglePromotionMutation.isPending}
                />
              ))}
            </div>
          )}
        </PanelSection>
      </Panel>

      {/* Program Analytics Sheet */}
      <ProgramAnalyticsSheet
        open={isAnalyticsOpen}
        onOpenChange={setIsAnalyticsOpen}
        clerkOrgId={clerkOrgId}
        programId={analyticsProgram?.id}
      />

      {/* Program Wizard Dialog */}
      <ProgramWizard
        open={isProgramWizardOpen}
        onOpenChange={(open) => {
          setIsProgramWizardOpen(open);
          if (!open) setEditingProgram(null);
        }}
        program={editingProgram}
        isLoading={createProgramMutation.isPending || updateProgramMutation.isPending}
        onSubmit={handleCreateOrUpdateProgram}
      />

      {/* Promotion Dialog */}
      <PromotionDialog
        open={isPromotionDialogOpen}
        onOpenChange={(open) => {
          setIsPromotionDialogOpen(open);
          if (!open) setEditingPromotion(null);
        }}
        promotion={editingPromotion}
        isLoading={createPromotionMutation.isPending || updatePromotionMutation.isPending}
        createdBy={userInfo?.id}
        menuItems={menuItems}
        onSubmit={handleCreateOrUpdatePromotion}
      />

      {/* Delete Program Confirmation Dialog */}
      <AlertDialog
        open={!!programToDelete}
        onOpenChange={(open) => {
          if (!deleteProgramMutation.isPending && !open) setProgramToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>Delete &quot;{programToDelete?.name}&quot;?</AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              This will deactivate this loyalty program and customers will no longer be able to earn rewards from it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {programToDelete && (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              <div
                className="h-8 w-8 shrink-0 rounded-full"
                style={{ backgroundColor: programToDelete.display_color ?? '#6366f1' }}
              />
              <div>
                <p className="font-medium">{programToDelete.name}</p>
                <p className="text-sm text-muted-foreground">{programToDelete.program_type}</p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProgramMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteProgram}
              disabled={deleteProgramMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProgramMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Promotion Confirmation Dialog */}
      <AlertDialog
        open={!!promotionToDelete}
        onOpenChange={(open) => {
          if (!deletePromotionMutation.isPending && !open) setPromotionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>Delete &quot;{promotionToDelete?.name}&quot;?</AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              This will deactivate this promotion and customers will no longer see or be able to use it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {promotionToDelete && (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              <Sparkles className="h-6 w-6 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">{promotionToDelete.name}</p>
                <p className="text-sm text-muted-foreground">{promotionToDelete.promo_type}</p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePromotionMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeletePromotion}
              disabled={deletePromotionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePromotionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
