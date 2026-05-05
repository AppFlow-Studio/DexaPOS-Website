"use client";


import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateCustomer } from "../hooks/useCustomers";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone, normalizePhone } from "@/lib/phone";

const SUGGESTED_TAGS = [
  "VIP",
  "REGULAR",
  "NEW",
  "CORPORATE",
  "FRIEND_OF_OWNER",
  "INFLUENCER",
  "CATERING_CLIENT",
];

const formatTagForDisplay = (tag: string): string => {
  return tag
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

const VIP_LEVELS = ["None", "Silver", "Gold", "Platinum"];
const SEATING_PREFERENCES = ["", "Indoor", "Outdoor", "Bar", "Booth", "Window"];
const DIETARY_PREFERENCES = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Halal",
  "Kosher",
  "Nut Allergy",
  "Dairy-Free",
  "Shellfish Allergy",
];

const createCustomerSchema = z.object({
  // Contact
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().min(1, "Phone is required").refine(v => isValidPhone(v), { message: 'Enter a valid phone number' }),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  address: z.string().optional(),

  // Personal
  birthday: z.string().optional(),
  anniversary: z.string().optional(),
  company_name: z.string().optional(),

  // Dining
  vip_level: z.string().optional(),
  preferred_seating: z.string().optional(),
  dietary_preferences: z.array(z.string()).optional(),
  allergy_notes: z.string().optional(),
  preferred_table: z.string().optional(),

  // Communication
  preferred_language: z.string().optional(),
  email_opt_in: z.boolean().optional(),
  sms_opt_in: z.boolean().optional(),
  receipt_via_email: z.boolean().optional(),
  receipt_via_sms: z.boolean().optional(),

  // Tags & Notes
  notes: z.string().optional(),
});



interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCustomerDialog({ open, onOpenChange }: CreateCustomerDialogProps) {
  const createCustomer = useCreateCustomer();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);

  const form = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      address: "",
      birthday: "",
      anniversary: "",
      company_name: "",
      vip_level: "None",
      preferred_seating: "",
      dietary_preferences: [],
      allergy_notes: "",
      preferred_table: "",
      preferred_language: "",
      email_opt_in: false,
      sms_opt_in: false,
      receipt_via_email: false,
      receipt_via_sms: false,
      notes: "",
    },
  });

  // Dietary preferences are handled as checkboxes
  const handleToggleDietaryPref = (pref: string) => {
    setDietaryPrefs((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
    form.setValue(
      "dietary_preferences",
      dietaryPrefs.includes(pref)
        ? dietaryPrefs.filter((p) => p !== pref)
        : [...dietaryPrefs, pref]
    );
  };

  const handleAddTag = (tag: string) => {
    const normalized = tag.trim().toUpperCase();
    if (!normalized || tags.includes(normalized)) return;
    setTags((prev) => [...prev, normalized]);
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
      setTags([]);
      setTagInput("");
      setDietaryPrefs([]);
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (values: CreateCustomerFormValues) => {
    try {
      const result = await createCustomer.mutateAsync({
        name: values.name,
        phone: normalizePhone(values.phone) ?? values.phone,
        email: values.email || undefined,
        address: values.address || undefined,
        birthday: values.birthday || undefined,
        anniversary: values.anniversary || undefined,
        company_name: values.company_name || undefined,
        vip_level: values.vip_level && values.vip_level !== "None" ? values.vip_level : undefined,
        preferred_seating: values.preferred_seating || undefined,
        dietary_preferences: dietaryPrefs.length > 0 ? dietaryPrefs : undefined,
        allergy_notes: values.allergy_notes || undefined,
        preferred_table: values.preferred_table || undefined,
        preferred_language: values.preferred_language || undefined,
        email_opt_in: values.email_opt_in || false,
        sms_opt_in: values.sms_opt_in || false,
        receipt_via_email: values.receipt_via_email || false,
        receipt_via_sms: values.receipt_via_sms || false,
        notes: values.notes || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (result.success) {
        toast.success("Customer created", {
          description: `${values.name} has been added to your customer list.`,
        });
        handleClose(false);
      } else {
        toast.error("Failed to create customer", {
          description: result.error || "An unexpected error occurred.",
        });
      }
    } catch {
      toast.error("Failed to create customer");
    }
  };

  const suggestedNewTags = SUGGESTED_TAGS.filter((tag) => !tags.includes(tag));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/10">
              <UserPlus className="h-5 w-5 text-violet-500" />
            </div>
            <div className="flex-1">
              <DialogTitle>New Customer</DialogTitle>
              <DialogDescription>
                Add a new customer to your database
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-2">
            {/* Contact Section */}
            <div>
              <h3 className="font-semibold text-base mb-2">Contact <span className="text-destructive">*</span></h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <PhoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Street address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Personal Section */}
            <div>
              <h3 className="font-semibold text-base mb-2">Personal</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="birthday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birthday</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="anniversary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anniversary</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Acme Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Dining Preferences Section */}
            <div>
              <h3 className="font-semibold text-base mb-2">Dining Preferences</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vip_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VIP Level</FormLabel>
                      <FormControl>
                        <select className="w-full border rounded px-2 py-2" {...field}>
                          {VIP_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="preferred_seating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Seating</FormLabel>
                      <FormControl>
                        <select className="w-full border rounded px-2 py-2" {...field}>
                          {SEATING_PREFERENCES.map((seating) => (
                            <option key={seating} value={seating}>
                              {seating || "(None)"}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="preferred_table"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Table</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Booth 3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-4">
                <label className="text-sm font-medium mb-2 block">Dietary Preferences</label>
                <div className="flex flex-wrap gap-3">
                  {DIETARY_PREFERENCES.map((pref) => (
                    <label key={pref} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={dietaryPrefs.includes(pref)}
                        onChange={() => handleToggleDietaryPref(pref)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{pref}</span>
                    </label>
                  ))}
                </div>
              </div>
              <FormField
                control={form.control}
                name="allergy_notes"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Allergy Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Severe peanut allergy — alert kitchen"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Communication Section */}
            <div>
              <h3 className="font-semibold text-base mb-2">Communication</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="preferred_language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Language</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., English" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email_opt_in"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 mt-2">
                      <FormControl>
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} />
                      </FormControl>
                      <FormLabel className="mb-0">Email Opt-In</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sms_opt_in"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 mt-2">
                      <FormControl>
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} />
                      </FormControl>
                      <FormLabel className="mb-0">SMS Opt-In</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="receipt_via_email"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 mt-2">
                      <FormControl>
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} />
                      </FormControl>
                      <FormLabel className="mb-0">Receipt via Email</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="receipt_via_sms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 mt-2">
                      <FormControl>
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} />
                      </FormControl>
                      <FormLabel className="mb-0">Receipt via SMS</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Tags & Notes Section */}
            <div>
              <h3 className="font-semibold text-base mb-2">Tags & Notes</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Tags</label>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {formatTagForDisplay(tag)}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddTag(tagInput)}
                    disabled={!tagInput.trim()}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>
                {suggestedNewTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {suggestedNewTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        className="text-xs px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        + {formatTagForDisplay(tag)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any notes about this customer..."
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Customer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
