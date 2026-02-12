import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { TEMPLATE_FIELD_VISIBILITY } from "../constants";
import type { TemplateType, ReceiptTemplateFormData } from "../types";

interface ReceiptSettingsFormProps {
  templateType: TemplateType;
  formState: ReceiptTemplateFormData;
  onChange: (update: Partial<ReceiptTemplateFormData>) => void;
}

function ToggleField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ReceiptSettingsForm({
  templateType,
  formState,
  onChange,
}: ReceiptSettingsFormProps) {
  const visibility = TEMPLATE_FIELD_VISIBILITY[templateType];

  // Whether branding section has text fields (header/footer shown for types that have show_logo)
  const showBrandingSection =
    visibility.show_logo;

  const showContentSection =
    visibility.show_item_modifiers ||
    visibility.show_tax_breakdown ||
    visibility.show_tip_line ||
    visibility.show_server_name ||
    visibility.show_order_type;

  const showExtrasSection =
    visibility.show_barcode || visibility.show_qr_code;

  const showKitchenSection =
    visibility.large_item_text ||
    visibility.show_mods_large ||
    visibility.group_by_station ||
    visibility.show_allergy_alert ||
    visibility.show_ready_by_time;

  return (
    <div className="space-y-6">
      {/* Branding Section */}
      {showBrandingSection && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Branding
          </h3>

          <ToggleField
            label="Show Logo"
            description="Display your business logo at the top"
            checked={formState.show_logo}
            onCheckedChange={(v) => onChange({ show_logo: v })}
          />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Header Text</Label>
            <Textarea
              placeholder="Custom header text (e.g. address, phone)..."
              className="resize-none text-sm"
              rows={2}
              value={formState.header_text}
              onChange={(e) => onChange({ header_text: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Footer Text</Label>
            <Textarea
              placeholder="Custom footer text (e.g. return policy, thank you message)..."
              className="resize-none text-sm"
              rows={2}
              value={formState.footer_text}
              onChange={(e) => onChange({ footer_text: e.target.value })}
            />
          </div>
        </div>
      )}

      {showBrandingSection && showContentSection && <Separator />}

      {/* Content Section */}
      {showContentSection && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Content
          </h3>

          {visibility.show_item_modifiers && (
            <ToggleField
              label="Show Item Modifiers"
              description="Display modifiers and customizations under each item"
              checked={formState.show_item_modifiers}
              onCheckedChange={(v) => onChange({ show_item_modifiers: v })}
            />
          )}

          {visibility.show_tax_breakdown && (
            <ToggleField
              label="Show Tax Breakdown"
              description="Show itemized tax amounts"
              checked={formState.show_tax_breakdown}
              onCheckedChange={(v) => onChange({ show_tax_breakdown: v })}
            />
          )}

          {visibility.show_tip_line && (
            <ToggleField
              label="Show Tip Line"
              description="Include a tip line for customer signatures"
              checked={formState.show_tip_line}
              onCheckedChange={(v) => onChange({ show_tip_line: v })}
            />
          )}

          {visibility.show_server_name && (
            <ToggleField
              label="Show Server Name"
              description="Display the server who placed the order"
              checked={formState.show_server_name}
              onCheckedChange={(v) => onChange({ show_server_name: v })}
            />
          )}

          {visibility.show_order_type && (
            <ToggleField
              label="Show Order Type"
              description="Display order type (Dine In, Takeout, etc.)"
              checked={formState.show_order_type}
              onCheckedChange={(v) => onChange({ show_order_type: v })}
            />
          )}
        </div>
      )}

      {showContentSection && showExtrasSection && <Separator />}

      {/* Extras Section */}
      {showExtrasSection && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Extras
          </h3>

          {visibility.show_barcode && (
            <ToggleField
              label="Show Barcode"
              description="Print a barcode for order lookup"
              checked={formState.show_barcode}
              onCheckedChange={(v) => onChange({ show_barcode: v })}
            />
          )}

          {visibility.show_qr_code && (
            <ToggleField
              label="Show QR Code"
              description="Print a QR code for digital receipts"
              checked={formState.show_qr_code}
              onCheckedChange={(v) => onChange({ show_qr_code: v })}
            />
          )}
        </div>
      )}

      {(showContentSection || showExtrasSection) && showKitchenSection && (
        <Separator />
      )}

      {/* Kitchen/Bar Section */}
      {showKitchenSection && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Kitchen / Bar
          </h3>

          {visibility.large_item_text && (
            <ToggleField
              label="Large Item Text"
              description="Use larger font for item names for easier reading"
              checked={formState.large_item_text}
              onCheckedChange={(v) => onChange({ large_item_text: v })}
            />
          )}

          {visibility.show_mods_large && (
            <ToggleField
              label="Large Modifier Text"
              description="Use larger font for modifier text"
              checked={formState.show_mods_large}
              onCheckedChange={(v) => onChange({ show_mods_large: v })}
            />
          )}

          {visibility.group_by_station && (
            <ToggleField
              label="Group by Station"
              description="Group items by prep station"
              checked={formState.group_by_station}
              onCheckedChange={(v) => onChange({ group_by_station: v })}
            />
          )}

          {visibility.show_allergy_alert && (
            <ToggleField
              label="Show Allergy Alerts"
              description="Highlight allergy warnings on items"
              checked={formState.show_allergy_alert}
              onCheckedChange={(v) => onChange({ show_allergy_alert: v })}
            />
          )}

          {visibility.show_ready_by_time && (
            <ToggleField
              label="Show Ready-By Time"
              description="Display the target preparation time"
              checked={formState.show_ready_by_time}
              onCheckedChange={(v) => onChange({ show_ready_by_time: v })}
            />
          )}
        </div>
      )}
    </div>
  );
}
