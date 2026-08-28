import { ScheduleTemplate, TemplateShift } from "@/types/schedule";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ScheduleTemplateState {
  templates: ScheduleTemplate[];
  activeTemplateIds: string[];
  actions: {
    addTemplate: (templateData: Omit<ScheduleTemplate, "id">) => void;
    updateTemplate: (
      templateId: string,
      updatedData: Partial<Omit<ScheduleTemplate, "id">>
    ) => void;
    deleteTemplate: (templateId: string) => void;
    duplicateTemplate: (templateId: string) => void;
    setActiveTemplateIds: (templateIds: string[]) => void;
  };
  reset: () => void;
}

const getBaseTemplateName = (name: string) =>
  name.replace(/(?:\s*\(Copy(?:\s+\d+)?\))+$/i, "").trim();

export const useScheduleTemplateStore = create<ScheduleTemplateState>()(
  persist(
    (set, get) => ({
      templates: [],
      activeTemplateIds: [],
      actions: {
        addTemplate: (templateData) =>
          set((state) => ({
            templates: [
              ...state.templates,
              { id: crypto.randomUUID(), ...templateData },
            ],
          })),
        updateTemplate: (templateId, updatedData) =>
          set((state) => ({
            templates: state.templates.map((template) =>
              template.id === templateId
                ? { ...template, ...updatedData }
                : template
            ),
          })),
        deleteTemplate: (templateId) =>
          set((state) => ({
            templates: state.templates.filter(
              (template) => template.id !== templateId
            ),
            activeTemplateIds: state.activeTemplateIds.filter(
              (id) => id !== templateId
            ),
          })),
        duplicateTemplate: (templateId) => {
          const templates = get().templates;
          const templateToDuplicate = templates.find(
            (template) => template.id === templateId
          );
          if (templateToDuplicate) {
            const baseName = getBaseTemplateName(templateToDuplicate.name);
            const matchingCopies = templates.filter((template) => {
              const normalizedName = getBaseTemplateName(template.name);
              return (
                normalizedName.toLocaleLowerCase() ===
                  baseName.toLocaleLowerCase() &&
                template.name.trim().toLocaleLowerCase() !==
                  baseName.toLocaleLowerCase()
              );
            });
            const highestCopyNumber = matchingCopies.reduce(
              (highest, template) => {
                const match = template.name.match(/\(Copy\s+(\d+)\)$/i);
                return match ? Math.max(highest, Number(match[1])) : highest;
              },
              0,
            );
            const nextCopyNumber =
              Math.max(highestCopyNumber, matchingCopies.length) + 1;
            const newTemplate: ScheduleTemplate = {
              ...templateToDuplicate,
              id: crypto.randomUUID(),
              name: `${baseName} (Copy ${nextCopyNumber})`,
              shifts: templateToDuplicate.shifts.map((shift) => ({
                ...shift,
                tempId: crypto.randomUUID(),
              })),
            };
            set((state) => ({
              templates: [...state.templates, newTemplate],
            }));
          }
        },
        setActiveTemplateIds: (templateIds) =>
          set(() => ({
            activeTemplateIds: templateIds,
          })),
      },
      reset: () => set({ templates: [], activeTemplateIds: [] }),
    }),
    {
      name: "schedule-template-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        templates: state.templates,
        activeTemplateIds: state.activeTemplateIds,
      }),
      version: 1,
      migrate: (persistedState, version) => {
        if (version >= 1) return persistedState as ScheduleTemplateState;

        const state = persistedState as Pick<
          ScheduleTemplateState,
          "templates" | "activeTemplateIds"
        >;
        const copyCounts = new Map<string, number>();

        return {
          ...state,
          templates: (state.templates ?? []).map((template) => {
            const baseName = getBaseTemplateName(template.name);
            if (template.name.trim() === baseName) return template;

            const groupKey = baseName.toLocaleLowerCase();
            const copyNumber = (copyCounts.get(groupKey) ?? 0) + 1;
            copyCounts.set(groupKey, copyNumber);

            return {
              ...template,
              name: `${baseName} (Copy ${copyNumber})`,
            };
          }),
        } as ScheduleTemplateState;
      },
    }
  )
);

// Export actions for easier consumption
export const {
  addTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  setActiveTemplateIds,
} = useScheduleTemplateStore.getState().actions;
