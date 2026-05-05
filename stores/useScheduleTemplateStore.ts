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
          const templateToDuplicate = get().templates.find(
            (template) => template.id === templateId
          );
          if (templateToDuplicate) {
            const newTemplate: ScheduleTemplate = {
              ...templateToDuplicate,
              id: crypto.randomUUID(),
              name: `${templateToDuplicate.name} (Copy)`,
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
