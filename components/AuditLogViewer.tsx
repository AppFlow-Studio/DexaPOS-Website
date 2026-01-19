import React, { useState } from "react";
import {
  Search,
  Filter,
  Download,
  AlertCircle,
  Info,
  AlertTriangle,
  User,
  Clock,
  Tag,
  X,
} from "lucide-react";

interface AuditLog {
  id: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  organization_name: string;
  organization_type: string;
  action: string;
  action_category: string;
  severity: string;
  resource_type?: string;
  resource_name?: string;
  created_at: string;
  cross_org_action?: boolean;
  metadata?: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
}

const mockAuditLogs: AuditLog[] = [
  {
    id: "1",
    actor_email: "john@dexapos.com",
    actor_name: "John Admin",
    actor_role: "hq.platform_admin",
    organization_name: "Acme Distributors",
    organization_type: "carrier",
    action: "carrier.merchant_onboarded",
    action_category: "carrier",
    severity: "info",
    resource_type: "merchant",
    resource_name: "Joes Pizza",
    created_at: "2025-01-18T10:30:00Z",
    cross_org_action: true,
    metadata: { merchant_id: "merch_123", plan: "premium" },
  },
  {
    id: "2",
    actor_email: "sarah@acmedist.com",
    actor_name: "Sarah Manager",
    actor_role: "carrier.manager",
    organization_name: "Joes Pizza",
    organization_type: "merchant",
    action: "inventory.product_created",
    action_category: "inventory",
    severity: "info",
    resource_type: "product",
    resource_name: "Large Pepperoni Pizza",
    created_at: "2025-01-18T09:15:00Z",
    changes: {
      after: { name: "Large Pepperoni Pizza", price: 14.99, stock: 50 },
    },
  },
  {
    id: "3",
    actor_email: "cashier@joespizza.com",
    actor_name: "Mike Cashier",
    actor_role: "merchant.cashier",
    organization_name: "Joes Pizza",
    organization_type: "merchant",
    action: "financial.transaction_completed",
    action_category: "financial",
    severity: "info",
    resource_type: "transaction",
    resource_name: "TXN-20250118-001",
    created_at: "2025-01-18T08:45:00Z",
    metadata: { amount: 29.98, currency: "USD", payment_method: "card" },
  },
  {
    id: "4",
    actor_email: "admin@joespizza.com",
    actor_name: "Joe Owner",
    actor_role: "merchant.owner",
    organization_name: "Joes Pizza",
    organization_type: "merchant",
    action: "team.user_invited",
    action_category: "team",
    severity: "info",
    resource_type: "user",
    resource_name: "newstaff@joespizza.com",
    created_at: "2025-01-17T16:20:00Z",
    changes: {
      after: { role: "merchant.cashier", status: "invited" },
    },
  },
  {
    id: "5",
    actor_email: "system@dexapos.com",
    actor_name: "System",
    actor_role: "system",
    organization_name: "Joes Pizza",
    organization_type: "merchant",
    action: "pos.shift_ended",
    action_category: "pos",
    severity: "warning",
    resource_type: "shift",
    created_at: "2025-01-17T14:00:00Z",
    metadata: { total_sales: 856.43, transactions: 34 },
  },
  {
    id: "6",
    actor_email: "john@dexapos.com",
    actor_name: "John Admin",
    actor_role: "hq.platform_admin",
    organization_name: "Acme Distributors",
    organization_type: "carrier",
    action: "settings.billing_changed",
    action_category: "settings",
    severity: "critical",
    resource_type: "settings",
    created_at: "2025-01-16T11:30:00Z",
    changes: {
      before: { plan: "basic", price: 99 },
      after: { plan: "premium", price: 199 },
    },
  },
];

export default function AuditLogViewer() {
  const [logs] = useState(mockAuditLogs);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const categories = [
    "all",
    "authentication",
    "team",
    "inventory",
    "financial",
    "settings",
    "pos",
    "carrier",
    "customer",
  ];
  const severities = ["all", "info", "warning", "critical"];

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.actor_name &&
        log.actor_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.resource_name &&
        log.resource_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      categoryFilter === "all" || log.action_category === categoryFilter;
    const matchesSeverity =
      severityFilter === "all" || log.severity === severityFilter;

    return matchesSearch && matchesCategory && matchesSeverity;
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-50 border-red-200 text-red-800";
      case "warning":
        return "bg-orange-50 border-orange-200 text-orange-800";
      default:
        return "bg-blue-50 border-blue-200 text-blue-800";
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      authentication: "bg-purple-100 text-purple-700",
      team: "bg-green-100 text-green-700",
      inventory: "bg-yellow-100 text-yellow-700",
      financial: "bg-emerald-100 text-emerald-700",
      settings: "bg-gray-100 text-gray-700",
      pos: "bg-blue-100 text-blue-700",
      carrier: "bg-indigo-100 text-indigo-700",
      customer: "bg-pink-100 text-pink-700",
    };
    return colors[category] || "bg-gray-100 text-gray-700";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAction = (action: string) => {
    return action
      .split(".")
      .pop()!
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Audit Logs</h1>
        <p className="text-gray-600">
          Track all activities across your organization
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "all"
                  ? "All Categories"
                  : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {severities.map((sev) => (
              <option key={sev} value={sev}>
                {sev === "all"
                  ? "All Severities"
                  : sev.charAt(0).toUpperCase() + sev.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Showing {filteredLogs.length} of {logs.length} logs
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredLogs.map((log) => (
          <div
            key={log.id}
            onClick={() => setSelectedLog(log)}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-1">{getSeverityIcon(log.severity)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${getCategoryColor(log.action_category)}`}
                    >
                      {log.action_category}
                    </span>
                    {log.cross_org_action && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700">
                        Cross-Org
                      </span>
                    )}
                  </div>

                  <div className="font-semibold text-gray-900 mb-1">
                    {formatAction(log.action)}
                    {log.resource_name && (
                      <span className="text-gray-600 font-normal">
                        {" "}
                        · {log.resource_name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {log.actor_name}
                    </div>
                    <div className="flex items-center gap-1">
                      <Tag className="w-4 h-4" />
                      {log.organization_name}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-xs font-medium ${getSeverityColor(log.severity)}`}
              >
                {log.severity}
              </div>
            </div>
          </div>
        ))}

        {filteredLogs.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No logs found
            </h3>
            <p className="text-gray-600">
              Try adjusting your filters or search query
            </p>
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Audit Log Details
              </h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-2">
                  ACTION
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm px-3 py-1 rounded-full font-medium ${getCategoryColor(selectedLog.action_category)}`}
                  >
                    {selectedLog.action_category}
                  </span>
                  <span className="text-lg font-semibold text-gray-900">
                    {formatAction(selectedLog.action)}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-2">
                  ACTOR
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Name</div>
                      <div className="font-medium">
                        {selectedLog.actor_name}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Email</div>
                      <div className="font-medium">
                        {selectedLog.actor_email}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Role</div>
                      <div className="font-medium">
                        {selectedLog.actor_role}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Organization
                      </div>
                      <div className="font-medium">
                        {selectedLog.organization_name}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedLog.resource_type && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">
                    RESOURCE
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Type</div>
                        <div className="font-medium">
                          {selectedLog.resource_type}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Name</div>
                        <div className="font-medium">
                          {selectedLog.resource_name || "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedLog.changes && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">
                    CHANGES
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    {selectedLog.changes.before && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold text-red-600 mb-2">
                          Before
                        </div>
                        <pre className="text-sm bg-white rounded p-3 overflow-x-auto">
                          {JSON.stringify(selectedLog.changes.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.changes.after && (
                      <div>
                        <div className="text-xs font-semibold text-green-600 mb-2">
                          After
                        </div>
                        <pre className="text-sm bg-white rounded p-3 overflow-x-auto">
                          {JSON.stringify(selectedLog.changes.after, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedLog.metadata && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">
                    METADATA
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-sm overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-2">
                  TIMESTAMP
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="font-medium">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDate(selectedLog.created_at)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
