"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import {
  User,
  Package,
  MapPin,
  Star,
  LogOut,
  X,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  Phone,
  Edit2,
  Check,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { useSession } from "../hooks/useSession";
import { clearSession } from "../session-actions";
import {
  getCustomerProfile,
  updateCustomerProfile,
  getSavedAddresses,
  addSavedAddress,
  deleteSavedAddress,
  setDefaultAddress,
  getLoyaltyStatus,
  type CustomerProfile,
  type SavedAddress,
  type LoyaltyProgramStatus,
} from "../customer-actions";
import {
  getOrderHistory,
  type OrderHistoryEntry,
} from "../order-actions";
import { AuthDialog } from "./AuthDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatPhoneForDisplay } from "@/lib/phone";

type Section = "main" | "orders" | "addresses" | "loyalty" | "profile";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

interface AccountDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  storeConfigId: string;
  showWelcomeOnMount?: boolean;
  onWelcomeShown?: () => void;
}

export function AccountDrawer({
  isOpen,
  onOpenChange,
  storeConfigId,
  showWelcomeOnMount,
  onWelcomeShown,
}: AccountDrawerProps) {
  const isDesktop = useIsDesktop();
  const {
    isAuthenticated,
    customer,
    sessionToken,
    logout,
    setCustomer,
  } = useSession();

  const [section, setSection] = useState<Section>("main");
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // Profile editing
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Orders
  const [orders, setOrders] = useState<OrderHistoryEntry[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Addresses
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [newAddr, setNewAddr] = useState({
    label: "Home",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    deliveryNotes: "",
  });

  // Loyalty
  const [loyalty, setLoyalty] = useState<LoyaltyProgramStatus[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSection("main");
      if (showWelcomeOnMount) {
        setJustLoggedIn(true);
        onWelcomeShown?.();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!justLoggedIn) return;
    const timer = setTimeout(() => setJustLoggedIn(false), 6000);
    return () => clearTimeout(timer);
  }, [justLoggedIn]);

  const loadSection = async (s: Section) => {
    setSection(s);
    if (!sessionToken) return;
    setLoading(true);

    switch (s) {
      case "profile": {
        const { data } = await getCustomerProfile(sessionToken);
        if (data) {
          setProfile(data);
          setEditName(data.name ?? "");
          setEditEmail(data.email ?? "");
        }
        break;
      }
      case "orders": {
        const { data } = await getOrderHistory(sessionToken);
        setOrders(data);
        break;
      }
      case "addresses": {
        const { data } = await getSavedAddresses(sessionToken);
        setAddresses(data);
        break;
      }
      case "loyalty": {
        const { data } = await getLoyaltyStatus(sessionToken);
        setLoyalty(data);
        break;
      }
    }

    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!sessionToken) return;
    setLoading(true);
    const result = await updateCustomerProfile(sessionToken, {
      name: editName,
      email: editEmail,
    });
    if (result.success) {
      setCustomer({ name: editName, email: editEmail });
      setIsEditing(false);
    }
    setLoading(false);
  };

  const handleAddAddress = async () => {
    if (!sessionToken || !newAddr.addressLine1 || !newAddr.city) return;
    setLoading(true);
    setAddressError(null);
    const result = await addSavedAddress(sessionToken, {
      ...newAddr,
      addressLine2: null,
      isDefault: addresses.length === 0,
    });
    if (result.success) {
      const { data } = await getSavedAddresses(sessionToken);
      setAddresses(data);
      setShowAddAddress(false);
      setNewAddr({
        label: "Home",
        addressLine1: "",
        city: "",
        state: "",
        postalCode: "",
        deliveryNotes: "",
      });
    } else {
      setAddressError(result.error || "Failed to save address.");
    }
    setLoading(false);
  };

  const handleDeleteAddress = async (id: string) => {
    if (!sessionToken) return;
    await deleteSavedAddress(sessionToken, id);
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSetDefaultAddress = async (id: string) => {
    if (!sessionToken) return;
    // Optimistic: flip default locally so the UI updates instantly.
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
    const result = await setDefaultAddress(sessionToken, id);
    if (!result.success) {
      // Re-sync from server on failure.
      const { data } = await getSavedAddresses(sessionToken);
      setAddresses(data);
    }
  };

  const handleSignOut = async () => {
    if (sessionToken) {
      await clearSession(sessionToken);
    }
    logout();
    onOpenChange(false);
  };
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const menuItems = [
    { id: "profile" as Section, icon: User, label: "Profile" },
    { id: "orders" as Section, icon: Package, label: "Order History" },
    { id: "addresses" as Section, icon: MapPin, label: "Saved Addresses" },
    { id: "loyalty" as Section, icon: Star, label: "Rewards" },
  ];

  const renderContent = () => {
    if (!isAuthenticated) {
      return (
        <div className="flex flex-col items-center justify-center h-[300px] text-center px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--card)" }}
          >
            <User className="h-8 w-8" style={{ color: "var(--text-secondary)" }} />
          </div>
          <p className="font-medium mb-1" style={{ color: "var(--text)" }}>
            Sign in to your account
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            View orders, save addresses, and earn rewards
          </p>
          <Button
            onClick={() => setShowAuth(true)}
            style={{
              backgroundColor: "var(--primary)",
              color: "#fff",
              borderRadius: "var(--radius)",
            }}
          >
            Sign In
          </Button>
        </div>
      );
    }

    if (section === "main") {
      return (
        <div className="px-6 py-4 space-y-2">
          {/* Welcome banner */}
          <AnimatePresence>
            {justLoggedIn && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-3 px-4 py-3 rounded-xl mb-1"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
                }}
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                    {customer?.name ? `Welcome back, ${customer.name.split(" ")[0]}!` : "Welcome back!"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    You&apos;re now signed in.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* User info */}
          <div className="flex items-center gap-3 pb-4 mb-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg"
              style={{
                backgroundColor: "var(--primary)",
                color: "#fff",
              }}
            >
              {customer?.name
                ? customer.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                : <Phone className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-semibold" style={{ color: "var(--text)" }}>
                {customer?.name || "Guest"}
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {formatPhoneForDisplay(customer?.phone)}
              </p>
            </div>
          </div>

          {/* Menu items */}
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => loadSection(item.id)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" style={{ color: "var(--primary)" }} />
                <span className="font-medium" style={{ color: "var(--text)" }}>
                  {item.label}
                </span>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
            </button>
          ))}

          {/* Sign out */}
          <button
            onClick={() => setShowSignOutConfirm(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl mt-4 transition-colors"
            style={{
              border: "1px solid var(--border)",
            }}
          >
            <LogOut className="h-5 w-5 text-red-500" />
            <span className="font-medium text-red-500">Sign Out</span>
          </button>
        </div>
      );
    }

    if (section === "profile") {
      return (
        <div className="px-6 py-4 space-y-4">
          <button
            onClick={() => setSection("main")}
            className="p-2 rounded-full transition-colors hover:opacity-80 shrink-0"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text)" }} />
          </button>
          <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Profile
          </h3>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Phone</Label>
                <Input
                  value={customer?.phone ?? ""}
                  disabled
                  className="opacity-60"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!isEditing}
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  disabled={!isEditing}
                  type="email"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                />
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={loading}
                    className="flex-1"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "#fff",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="flex-1"
                    style={{ borderColor: "var(--border)", borderRadius: "var(--radius)" }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="w-full"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius)" }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              )}

              {profile && (
                <div
                  className="grid grid-cols-2 gap-3 pt-4"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div className="text-center p-3 rounded-lg" style={{ backgroundColor: "var(--card)" }}>
                    <p className="text-xl font-bold" style={{ color: "var(--text)" }}>
                      {profile.totalOrders}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Orders
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg" style={{ backgroundColor: "var(--card)" }}>
                    <p className="text-xl font-bold" style={{ color: "var(--text)" }}>
                      ${profile.lifetimeSpend.toFixed(0)}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Lifetime Spend
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (section === "orders") {
      return (
        <div className="px-6 py-4 space-y-4">
          <button
            onClick={() => setSection("main")}
            className="p-2 rounded-full transition-colors hover:opacity-80 shrink-0"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text)" }} />
          </button>
          <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Order History
          </h3>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
              <p style={{ color: "var(--text-secondary)" }}>No orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <button
                    onClick={() =>
                      setExpandedOrder(
                        expandedOrder === order.id ? null : order.id
                      )
                    }
                    className="w-full text-left p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold" style={{ color: "var(--text)" }}>
                          {order.displayNumber}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {new Date(order.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold" style={{ color: "var(--text)" }}>
                          ${order.total.toFixed(2)}
                        </p>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full capitalize"
                          style={{
                            backgroundColor:
                              order.status === "completed"
                                ? "rgba(16,185,129,0.1)"
                                : "rgba(245,158,11,0.1)",
                            color:
                              order.status === "completed"
                                ? "#10b981"
                                : "#f59e0b",
                          }}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </button>

                  {expandedOrder === order.id && (
                    <div
                      className="px-4 pb-4 space-y-1"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      {order.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex justify-between text-sm py-1"
                        >
                          <span style={{ color: "var(--text-secondary)" }}>
                            {item.quantity}x {item.name}
                          </span>
                          <span style={{ color: "var(--text-secondary)" }}>
                            ${item.subtotal.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (section === "addresses") {
      return (
        <div className="px-6 py-4 space-y-4">
          <button
            onClick={() => setSection("main")}
            className="p-2 rounded-full transition-colors hover:opacity-80 shrink-0"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text)" }} />
          </button>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Saved Addresses
            </h3>
            <Button
              size="sm"
              onClick={() => { setAddressError(null); setShowAddAddress(true); }}
              style={{
                backgroundColor: "var(--primary)",
                color: "#fff",
                borderRadius: "var(--radius)",
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
            </div>
          ) : (
            <>
              {showAddAddress && (
                <div
                  className="p-4 rounded-xl space-y-3"
                  style={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <select
                        value={newAddr.label}
                        onChange={(e) =>
                          setNewAddr((a) => ({ ...a, label: e.target.value }))
                        }
                        className="w-full h-9 px-3 rounded-md text-sm"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                        }}
                      >
                        <option value="Home">Home</option>
                        <option value="Work">Work</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <Input
                    value={newAddr.addressLine1}
                    onChange={(e) =>
                      setNewAddr((a) => ({ ...a, addressLine1: e.target.value }))
                    }
                    placeholder="Street address"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                      value={newAddr.city}
                      onChange={(e) =>
                        setNewAddr((a) => ({ ...a, city: e.target.value }))
                      }
                      placeholder="City"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                    />
                    <Input
                      value={newAddr.state}
                      onChange={(e) =>
                        setNewAddr((a) => ({ ...a, state: e.target.value }))
                      }
                      placeholder="State"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                    />
                    <Input
                      value={newAddr.postalCode}
                      onChange={(e) =>
                        setNewAddr((a) => ({ ...a, postalCode: e.target.value }))
                      }
                      placeholder="ZIP"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                    />
                  </div>
                  <Input
                    value={newAddr.deliveryNotes}
                    onChange={(e) =>
                      setNewAddr((a) => ({
                        ...a,
                        deliveryNotes: e.target.value,
                      }))
                    }
                    placeholder="Delivery notes"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                  />
                  {addressError && (
                    <p className="text-xs" style={{ color: "#ef4444" }}>
                      {addressError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddAddress}
                      disabled={loading}
                      className="flex-1"
                      style={{
                        backgroundColor: "var(--primary)",
                        color: "#fff",
                        borderRadius: "var(--radius)",
                      }}
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                      Save Address
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setAddressError(null); setShowAddAddress(false); }}
                      style={{ borderColor: "var(--border)", borderRadius: "var(--radius)" }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {addresses.length === 0 && !showAddAddress ? (
                <div className="text-center py-8">
                  <MapPin className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
                  <p style={{ color: "var(--text-secondary)" }}>No saved addresses</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className="p-3 rounded-xl"
                      style={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                              {addr.label}
                              {addr.isDefault && (
                                <span
                                  className="ml-2 text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)",
                                    color: "var(--primary)",
                                  }}
                                >
                                  Default
                                </span>
                              )}
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="p-1 rounded-md transition-colors hover:bg-red-50"
                          aria-label="Delete address"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </button>
                      </div>

                      {!addr.isDefault && (
                        <button
                          onClick={() => handleSetDefaultAddress(addr.id)}
                          className="mt-2 ml-6 flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                          style={{ color: "var(--primary)" }}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Set as default
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    if (section === "loyalty") {
      return (
        <div className="px-6 py-4 space-y-4">
          <button
            onClick={() => setSection("main")}
            className="p-2 rounded-full transition-colors hover:opacity-80 shrink-0"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text)" }} />
          </button>
          <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Rewards
          </h3>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
            </div>
          ) : loyalty.length === 0 ? (
            <div className="text-center py-8">
              <Star className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
              <p style={{ color: "var(--text-secondary)" }}>No rewards programs yet</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Keep ordering to earn rewards!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {loyalty.map((program) => (
                <div
                  key={program.programId}
                  className="p-4 rounded-xl"
                  style={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="h-5 w-5" style={{ color: "var(--primary)" }} />
                    <p className="font-semibold" style={{ color: "var(--text)" }}>
                      {program.programName}
                    </p>
                  </div>

                  {program.programType === "points" && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span style={{ color: "var(--text-secondary)" }}>Points</span>
                        <span className="font-bold" style={{ color: "var(--text)" }}>
                          {program.currentPoints.toLocaleString()}
                        </span>
                      </div>
                      <div
                        className="w-full h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            backgroundColor: "var(--primary)",
                            width: `${Math.min((program.currentPoints / 100) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {program.programType === "punches" && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span style={{ color: "var(--text-secondary)" }}>Punches</span>
                        <span className="font-bold" style={{ color: "var(--text)" }}>
                          {program.currentPunches}
                        </span>
                      </div>
                    </div>
                  )}

                  {program.availableRewards.length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                        Available Rewards
                      </p>
                      {program.availableRewards.map((reward) => (
                        <div
                          key={reward.id}
                          className="flex justify-between items-center py-1.5 text-sm"
                        >
                          <span style={{ color: "var(--text)" }}>{reward.description}</span>
                          {reward.expiresAt && (
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              Exp{" "}
                              {new Date(reward.expiresAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-4 mt-3 pt-3 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Earned: {program.totalRewardsEarned}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Redeemed: {program.totalRewardsRedeemed}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <SheetPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
        <SheetPrimitive.Portal>
          {/* Backdrop — dimmed on mobile, subtle on desktop */}
          <SheetPrimitive.Overlay
            className="fixed inset-0 z-[60] transition-opacity duration-200 data-[state=open]:opacity-100 data-[state=closed]:opacity-0"
            style={{
              backgroundColor: isDesktop ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.5)",
              backdropFilter: isDesktop ? "none" : "blur(4px)",
            }}
          />

          {/* Bottom sheet on mobile, right-side drawer on desktop.
              Keyframe-based slide (shared with CartSidebar) so the entrance
              always animates from off-screen regardless of mount timing. */}
          <SheetPrimitive.Content
            aria-label="Account"
            className={
              "fixed z-[70] flex flex-col " +
              (isDesktop ? "cart-slide-right" : "cart-slide-bottom")
            }
            style={
              isDesktop
                ? {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: "auto",
                    width: "420px",
                    maxWidth: "90vw",
                    maxHeight: "100vh",
                    backgroundColor: "var(--card)",
                    borderRadius: "16px 0 0 16px",
                    fontFamily: "var(--font)",
                    boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
                  }
                : {
                    bottom: 0,
                    left: 0,
                    right: 0,
                    top: "auto",
                    height: "85vh",
                    backgroundColor: "var(--card)",
                    borderRadius: "20px 20px 0 0",
                    fontFamily: "var(--font)",
                    boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
                  }
            }
          >
              {/* Drag Handle — mobile only */}
              <div className="flex justify-center pt-3 pb-1 shrink-0 lg:hidden">
                <div
                  className="w-10 h-1 rounded-full"
                  style={{ backgroundColor: "var(--border)" }}
                />
              </div>

              {/* Header */}
              <div
                className="px-6 py-3 flex items-center justify-between shrink-0"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <SheetPrimitive.Title
                  className="text-xl font-bold"
                  style={{
                    color: "var(--text)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  Account
                </SheetPrimitive.Title>
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-2 rounded-xl transition-colors"
                  style={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1 min-h-0 overflow-hidden">
                {renderContent()}
              </ScrollArea>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      </SheetPrimitive.Root>

      <AuthDialog
        isOpen={showAuth}
        onOpenChange={setShowAuth}
        storeConfigId={storeConfigId}
        onSuccess={() => {
          setShowAuth(false);
          setJustLoggedIn(true);
        }}
      />

      <ConfirmDialog
        open={showSignOutConfirm}
        onOpenChange={setShowSignOutConfirm}
        title="Sign out?"
        description="Are you sure you want to sign out of your account?"
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        onConfirm={handleSignOut}
      />
    </>
  );
}
