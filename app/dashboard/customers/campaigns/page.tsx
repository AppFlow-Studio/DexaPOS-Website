"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  MoreVertical,
  Trash2,
  Eye,
  Edit,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Mail,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMerchantMarketingCampaigns, useDeleteCampaign } from "../hooks/useCustomerMarketing";
import { CreateCampaignDialog } from "../components/campaigns/CreateCampaignDialog";
import { CampaignDetailSheet } from "../components/campaigns/CampaignDetailSheet";
import type { Database } from "@/types/database.types";

type Campaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];
type SortField = "created_at" | "name" | "status" | "campaign_type";
type SortDir = "asc" | "desc";

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  draft: { color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: <Clock className="w-4 h-4" />, label: "Draft" },
  scheduled: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <Clock className="w-4 h-4" />, label: "Scheduled" },
  sending: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: <Send className="w-4 h-4" />, label: "Sending" },
  sent: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle className="w-4 h-4" />, label: "Sent" },
  cancelled: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <AlertCircle className="w-4 h-4" />, label: "Cancelled" },
};

export default function CampaignsPage() {
  const router = useRouter();
  const { data: campaigns = [], isLoading } = useMerchantMarketingCampaigns();
  const deleteCampaignMutation = useDeleteCampaign();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Apply search filter
  const searchFiltered = useMemo(() => {
    if (!searchTerm.trim()) return campaigns;
    const term = searchTerm.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(term));
  }, [campaigns, searchTerm]);

  // Apply additional filters
  const filtered = useMemo(() => {
    return searchFiltered.filter((campaign) => {
      if (statusFilter && campaign.status !== statusFilter) return false;
      if (typeFilter && campaign.campaign_type !== typeFilter) return false;
      return true;
    });
  }, [searchFiltered, statusFilter, typeFilter]);

  // Sort campaigns
  const sorted = useMemo(() => {
    const data = [...filtered];
    data.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === "asc" ? 1 : -1;
      if (bVal == null) return sortDir === "asc" ? -1 : 1;

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleViewCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsDetailOpen(true);
  };

  const handleDeleteCampaign = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!campaignToDelete) return;
    try {
      await deleteCampaignMutation.mutateAsync(campaignToDelete.id);
      setIsDeleteDialogOpen(false);
      setCampaignToDelete(null);
    } catch (error) {
      console.error("Error deleting campaign:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaigns</h2>
          <p className="text-muted-foreground">
            Create and manage marketing campaigns for your customers
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? null : v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaigns Table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {sorted.length} Campaign{sorted.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center p-8 text-muted-foreground">Loading campaigns...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center p-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No campaigns yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first marketing campaign</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort("name")}>
                      Campaign {sortField === "name" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort("campaign_type")}>
                      Type {sortField === "campaign_type" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort("status")}>
                      Status {sortField === "status" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Recipients</th>
                    <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort("created_at")}>
                      Created {sortField === "created_at" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((campaign) => (
                    <tr key={campaign.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          {campaign.body && (
                            <p className="text-xs text-muted-foreground truncate mt-1">{campaign.body}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="gap-1">
                          {campaign.campaign_type === "sms" ? (
                            <MessageSquare className="w-3 h-3" />
                          ) : (
                            <Mail className="w-3 h-3" />
                          )}
                          {campaign.campaign_type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`gap-1 ${STATUS_CONFIG[campaign.status]?.color || "bg-gray-100"}`}>
                          {STATUS_CONFIG[campaign.status]?.icon}
                          {STATUS_CONFIG[campaign.status]?.label || campaign.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          <p>{campaign.total_recipients || 0} recipients</p>
                          {campaign.total_delivered !== null && (
                            <p className="text-xs text-muted-foreground">
                              {campaign.total_delivered} delivered
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewCampaign(campaign)} className="gap-2">
                              <Eye className="h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {campaign.status === "draft" && (
                              <DropdownMenuItem className="gap-2">
                                <Edit className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {(campaign.status === "draft" || campaign.status === "scheduled") && (
                              <DropdownMenuItem className="gap-2">
                                <Send className="h-4 w-4" />
                                Send Now
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteCampaign(campaign)}
                              className="gap-2 text-destructive hover:!bg-destructive/10 hover:!text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Campaign Dialog */}
      <CreateCampaignDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* Campaign Detail Sheet */}
      {selectedCampaign && (
        <CampaignDetailSheet
          campaign={selectedCampaign}
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
        />
      )}

      {/* Delete Campaign Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{campaignToDelete?.name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteCampaignMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCampaignMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
