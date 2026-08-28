"use client";


import { useState, type CSSProperties } from "react";
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
import { CalendarDays, Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateCustomer } from "../hooks/useCustomers";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

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

const MUTED_FIELD_CLASS =
  "border-0 bg-muted/60 shadow-none focus-visible:ring-1";
const NONE_VALUE = "__none__";

function parseDateValue(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function CustomerDatePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-between bg-muted/60 px-4 font-normal hover:bg-muted"
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-2rem))] border-0 bg-white p-0 shadow-lg dark:bg-popover"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            if (date) setOpen(false);
          }}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date()}
          classNames={{
            dropdown_root: "relative rounded-full border-0 bg-muted px-3 py-1",
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

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
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden border-0 bg-white p-0 dark:bg-background max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:overflow-hidden max-sm:rounded-none sm:max-w-[600px]">
        <DialogHeader className="shrink-0 px-4 pb-5 pt-6 sm:px-7 sm:pt-7">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-muted/60 p-2.5">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="thin-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto px-4 py-6 sm:px-7">
            {/* Contact Section */}
            <div>
              <h3 className="font-semibold text-base mb-2">Contact <span className="text-destructive">*</span></h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input className={MUTED_FIELD_CLASS} placeholder="Full name" {...field} />
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
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          className="[&_.react-international-phone-country-selector-button]:!border-0 [&_.react-international-phone-country-selector-button]:!bg-muted/60 [&_.react-international-phone-input]:!border-0 [&_.react-international-phone-input]:!bg-muted/60"
                          style={{
                            "--react-international-phone-border-color": "transparent",
                            "--react-international-phone-background-color": "color-mix(in oklab, var(--muted) 60%, transparent)",
                          } as CSSProperties}
                        />
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
                        <Input className={MUTED_FIELD_CLASS} type="email" placeholder="email@example.com" {...field} />
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
                        <Input className={MUTED_FIELD_CLASS} placeholder="Street address" {...field} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="birthday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birthday</FormLabel>
                      <FormControl>
                        <CustomerDatePicker
                          value={field.value || ""}
                          onChange={field.onChange}
                          placeholder="Select birthday"
                        />
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
                        <CustomerDatePicker
                          value={field.value || ""}
                          onChange={field.onChange}
                          placeholder="Select anniversary"
                        />
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
                        <Input className={MUTED_FIELD_CLASS} placeholder="e.g., Acme Corp" {...field} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vip_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VIP Level</FormLabel>
                      <FormControl>
                        <Select value={field.value || "None"} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full border-0 bg-muted/60 shadow-none focus:ring-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-0 bg-white dark:bg-popover">
                          {VIP_LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                          </SelectContent>
                        </Select>
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
                        <Select
                          value={field.value || NONE_VALUE}
                          onValueChange={(value) => field.onChange(value === NONE_VALUE ? "" : value)}
                        >
                          <SelectTrigger className="w-full border-0 bg-muted/60 shadow-none focus:ring-1">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent className="border-0 bg-white dark:bg-popover">
                          {SEATING_PREFERENCES.map((seating) => (
                            <SelectItem key={seating || NONE_VALUE} value={seating || NONE_VALUE}>
                              {seating || "None"}
                            </SelectItem>
                          ))}
                          </SelectContent>
                        </Select>
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
                        <Input className={MUTED_FIELD_CLASS} placeholder="e.g., Booth 3" {...field} />
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
                    <label key={pref} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5">
                      <Checkbox
                        checked={dietaryPrefs.includes(pref)}
                        onCheckedChange={() => handleToggleDietaryPref(pref)}
                        className="border-0 bg-background shadow-none"
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
                        className={MUTED_FIELD_CLASS}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="preferred_language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Language</FormLabel>
                      <FormControl>
                        <Input className={MUTED_FIELD_CLASS} placeholder="e.g., English" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email_opt_in"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3 rounded-xl bg-muted/60 px-3 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          className="border-0 bg-background shadow-none"
                        />
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
                    <FormItem className="flex flex-row items-center gap-3 rounded-xl bg-muted/60 px-3 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          className="border-0 bg-background shadow-none"
                        />
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
                    <FormItem className="flex flex-row items-center gap-3 rounded-xl bg-muted/60 px-3 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          className="border-0 bg-background shadow-none"
                        />
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
                    <FormItem className="flex flex-row items-center gap-3 rounded-xl bg-muted/60 px-3 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          className="border-0 bg-background shadow-none"
                        />
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
                        className="gap-1 border-0 pr-1"
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
                    className={`${MUTED_FIELD_CLASS} flex-1`}
                  />
                  <Button
                    type="button"
                    variant="secondary"
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
                        className="rounded-full border-0 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
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
                        className={MUTED_FIELD_CLASS}
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
            </div>

            <DialogFooter className="shrink-0 bg-white px-4 py-5 dark:bg-background sm:px-7">
              <Button
                type="button"
                variant="ghost"
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
