# DEXA POS - Order Management & Sync System
## Complete Implementation Guide

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Order Flow](#order-flow)
3. [Database Setup](#database-setup)
4. [Real-time Subscriptions](#real-time-subscriptions)
5. [TypeScript Integration](#typescript-integration)
6. [Payment Integration](#payment-integration)
7. [Best Practices](#best-practices)
8. [Testing & Validation](#testing--validation)

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   POS Tablet    │ ◄─────► │    Supabase DB   │ ◄─────► │  Admin Website  │
│  (React Native) │         │  + Realtime      │         │     (React)     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                             │
        │                            │                             │
        ▼                            ▼                             ▼
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Payment       │         │   Order State    │         │   Reporting &   │
│   Terminals     │         │   Management     │         │   Analytics     │
│  - SPINAPI      │         │   - RLS          │         └─────────────────┘
│  - DVPaylite    │         │   - Triggers     │
│  - Cash         │         │   - Functions    │
└─────────────────┘         └──────────────────┘
```

### Order State Machine

```
draft ──► pending ──► preparing ──► ready ──► completed
  │           │           │           │
  │           │           │           │
  └───────────┴───────────┴───────────┴──────► cancelled
  │           │           │           │
  └───────────┴───────────┴───────────┴──────► void
                                       │
                                       └──────► refunded
```

### Key Design Principles

1. **Optimistic Locking**: Use `sync_version` to handle concurrent updates
2. **Idempotency**: All write operations are idempotent using unique IDs
3. **Audit Trail**: Complete history of status changes and modifications
4. **Denormalization**: Item/price details stored for historical accuracy
5. **Real-time Sync**: Supabase Realtime for instant updates across devices

---

## 🔄 Order Flow

### 1. Creating an Order (POS Tablet)

```typescript
// Step 1: Create order
const { data: orderData } = await supabase.rpc('create_order', {
  p_merchant_id: merchantId,
  p_location_id: locationId,
  p_order_type: 'dine_in',
  p_table_number: '12',
  p_device_id: deviceId,
  p_created_by_staff_id: staffId
});

const orderId = orderData.order_id;

// Step 2: Add items
for (const item of cartItems) {
  await supabase.rpc('add_order_item', {
    p_order_id: orderId,
    p_menu_item_id: item.menuItemId,
    p_quantity: item.quantity,
    p_selected_size_id: item.sizeId,
    p_special_instructions: item.notes,
    p_modifiers: item.modifiers // JSONB array
  });
}

// Step 3: Calculate tax
await supabase.rpc('calculate_order_tax', {
  p_order_id: orderId,
  p_tax_rate: 0.0825 // NYC rate
});

// Step 4: Send to kitchen
await supabase.rpc('update_order_status', {
  p_order_id: orderId,
  p_new_status: 'pending',
  p_notes: 'Order fired to kitchen'
});
```

### 2. Payment Processing

#### Cash Payment
```typescript
await supabase.rpc('process_payment', {
  p_order_id: orderId,
  p_payment_method: 'cash',
  p_amount: totalAmount,
  p_tip_amount: tipAmount,
  p_terminal_type: 'none',
  p_device_id: deviceId
});
```

#### Card Payment via SPINAPI (External Terminal)
```typescript
// Step 1: Initiate payment on Dejavoo terminal
const spinApiRequest = {
  transactionType: 'SALE',
  amount: totalAmount,
  tipAmount: tipAmount,
  invoiceNumber: orderNumber
};

// Send to terminal via USB/Network
const terminalResponse = await sendToDejavooTerminal(spinApiRequest);

// Step 2: Record payment in database
await supabase.rpc('process_payment', {
  p_order_id: orderId,
  p_payment_method: 'card_spinapi',
  p_amount: totalAmount,
  p_tip_amount: tipAmount,
  p_terminal_type: 'dejavoo_spinapi',
  p_terminal_id: terminalSerialNumber,
  p_device_id: deviceId,
  p_transaction_details: {
    transaction_id: terminalResponse.transactionId,
    authorization_code: terminalResponse.authCode,
    card_type: terminalResponse.cardType,
    card_last_four: terminalResponse.lastFour,
    dejavoo_response_code: terminalResponse.responseCode,
    dejavoo_batch_number: terminalResponse.batchNumber
  }
});
```

#### Card Payment via DVPaylite (Native on P18 Tablet)
```typescript
// Step 1: Build DVPaylite request
const dvPayLiteRequest = {
  type: "SALE",
  applicationType: "DVPAYLITE",
  amount: (totalAmount * 100).toString(), // Convert to cents
  tipAmount: (tipAmount * 100).toString(),
  refId: orderId,
  invoiceNumber: orderNumber
};

// Step 2: Launch DVPaylite via deep link (URI mode)
const encodedRequest = encodeURIComponent(JSON.stringify(dvPayLiteRequest));
const deepLinkUrl = `pay://pay?data=${encodedRequest}`;

// Open DVPaylite
await Linking.openURL(deepLinkUrl);

// Step 3: Handle response (via app callback or polling)
const handleDVPayLiteResponse = async (response) => {
  if (response.transactionResult === 'Success') {
    await supabase.rpc('process_payment', {
      p_order_id: orderId,
      p_payment_method: 'card_dvpaylite',
      p_amount: totalAmount,
      p_tip_amount: tipAmount,
      p_terminal_type: 'dejavoo_p18',
      p_device_id: deviceId,
      p_transaction_details: {
        transaction_id: response.transactionId,
        authorization_code: response.authCode,
        card_type: response.cardType,
        card_last_four: response.lastFour,
        dvpaylite_request_id: dvPayLiteRequest.refId
      }
    });
  }
};
```

### 3. Order Updates (Admin Dashboard)

```typescript
// Subscribe to order changes
const orderSubscription = supabase
  .channel('orders')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `location_id=eq.${locationId}`
    },
    (payload) => {
      console.log('Order update:', payload);
      // Update UI
      updateOrderList(payload.new);
    }
  )
  .subscribe();

// Kitchen marks order as preparing
await supabase.rpc('update_order_status', {
  p_order_id: orderId,
  p_new_status: 'preparing'
});

// Kitchen marks order as ready
await supabase.rpc('update_order_status', {
  p_order_id: orderId,
  p_new_status: 'ready'
});
```

---

## 💾 Database Setup

### Installation Steps

```bash
# 1. Run schema creation
psql -h your-supabase-host -d postgres -f order_management_schema.sql

# 2. Set up RLS policies
psql -h your-supabase-host -d postgres -f order_management_rls.sql

# 3. Create functions
psql -h your-supabase-host -d postgres -f order_management_functions.sql
```

### Verification Queries

```sql
-- Verify tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'order%';

-- Verify RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'order%';

-- Verify functions created
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%order%';
```

---

## 📡 Real-time Subscriptions

### POS Tablet - Listen for Order Status Updates

```typescript
import { supabase } from './supabase';

const setupOrderSubscriptions = (locationId: string, onOrderUpdate: Function) => {
  // Subscribe to order status changes
  const orderStatusChannel = supabase
    .channel(`location_${locationId}_orders`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `location_id=eq.${locationId}`
      },
      (payload) => {
        console.log('Order status changed:', payload);
        onOrderUpdate(payload.new);
        
        // Show notification if order is ready
        if (payload.new.status === 'ready') {
          showNotification(`Order ${payload.new.display_number} is ready!`);
        }
      }
    )
    .subscribe();

  return () => {
    orderStatusChannel.unsubscribe();
  };
};

// Usage
useEffect(() => {
  const unsubscribe = setupOrderSubscriptions(
    locationId,
    (updatedOrder) => {
      // Update local state
      setOrders((prev) => 
        prev.map((o) => o.id === updatedOrder.id ? updatedOrder : o)
      );
    }
  );

  return unsubscribe;
}, [locationId]);
```

### Admin Dashboard - Real-time Order List

```typescript
const setupKitchenDisplay = (locationId: string) => {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    // Initial fetch
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            order_item_modifiers (*)
          )
        `)
        .eq('location_id', locationId)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: true });
      
      setOrders(data);
    };

    fetchOrders();

    // Real-time subscription
    const channel = supabase
      .channel(`kitchen_${locationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `location_id=eq.${locationId}`
        },
        (payload) => {
          // New order
          setOrders((prev) => [...prev, payload.new]);
          playOrderSound();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `location_id=eq.${locationId}`
        },
        (payload) => {
          // Order updated
          setOrders((prev) =>
            prev.map((o) => (o.id === payload.new.id ? payload.new : o))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders',
          filter: `location_id=eq.${locationId}`
        },
        (payload) => {
          // Order deleted
          setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [locationId]);

  return orders;
};
```

### Conflict Resolution with Optimistic Locking

```typescript
const updateOrderWithOptimisticLock = async (orderId: string, updates: any) => {
  // Get current version
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('sync_version')
    .eq('id', orderId)
    .single();

  // Attempt update with version check
  const { data, error } = await supabase
    .from('orders')
    .update({
      ...updates,
      sync_version: currentOrder.sync_version + 1,
      last_synced_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('sync_version', currentOrder.sync_version) // Optimistic lock
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows updated - version conflict
      throw new Error('Order was modified by another user. Please refresh.');
    }
    throw error;
  }

  return data;
};
```

---

## 🔧 TypeScript Integration

### Type Definitions

```typescript
// types/database.types.ts
export type OrderStatus = 
  | 'draft' 
  | 'pending' 
  | 'preparing' 
  | 'ready' 
  | 'completed' 
  | 'cancelled' 
  | 'refunded' 
  | 'void';

export type OrderType = 
  | 'dine_in' 
  | 'takeout' 
  | 'delivery' 
  | 'online' 
  | 'catering';

export type PaymentMethod = 
  | 'cash' 
  | 'card_spinapi' 
  | 'card_dvpaylite' 
  | 'card_manual' 
  | 'gift_card' 
  | 'house_account' 
  | 'external';

export type PaymentStatus = 
  | 'pending' 
  | 'processing' 
  | 'authorized' 
  | 'captured' 
  | 'failed' 
  | 'declined' 
  | 'refunded' 
  | 'partially_refunded' 
  | 'void';

export type TerminalType = 
  | 'dejavoo_spinapi' 
  | 'dejavoo_p18' 
  | 'manual' 
  | 'none';

export interface Order {
  id: string;
  order_number: string;
  display_number: string;
  merchant_id: string;
  location_id: string;
  order_type: OrderType;
  status: OrderStatus;
  customer_name?: string;
  customer_phone?: string;
  table_number?: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  amount_paid: number;
  amount_due: number;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
  sent_to_kitchen_at?: string;
  completed_at?: string;
  sync_version: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id?: string;
  location_exclusive_item_id?: string;
  item_name: string;
  item_description?: string;
  category_name?: string;
  quantity: number;
  unit_price: number;
  cash_price?: number;
  price_paid: number;
  subtotal: number;
  selected_size_id?: string;
  selected_size_name?: string;
  size_price_modifier: number;
  item_status: string;
  is_voided: boolean;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_group_id?: string;
  modifier_item_id?: string;
  modifier_group_name: string;
  modifier_name: string;
  price_modifier: number;
  quantity: number;
  total_price: number;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  tip_amount: number;
  total_amount: number;
  status: PaymentStatus;
  terminal_type: TerminalType;
  terminal_id?: string;
  transaction_id?: string;
  authorization_code?: string;
  card_type?: string;
  card_last_four?: string;
  initiated_at: string;
  captured_at?: string;
}

export interface CreateOrderParams {
  p_merchant_id: string;
  p_location_id: string;
  p_order_type?: OrderType;
  p_table_number?: string;
  p_customer_name?: string;
  p_customer_phone?: string;
  p_special_instructions?: string;
  p_device_id?: string;
  p_created_by_staff_id?: string;
}

export interface AddOrderItemParams {
  p_order_id: string;
  p_menu_item_id?: string;
  p_location_exclusive_item_id?: string;
  p_quantity?: number;
  p_selected_size_id?: string;
  p_special_instructions?: string;
  p_modifiers?: Array<{
    modifier_group_id: string;
    modifier_item_id: string;
    modifier_group_name: string;
    modifier_name: string;
    price_modifier: number;
    quantity?: number;
  }>;
}

export interface ProcessPaymentParams {
  p_order_id: string;
  p_payment_method: PaymentMethod;
  p_amount: number;
  p_tip_amount?: number;
  p_terminal_type?: TerminalType;
  p_terminal_id?: string;
  p_device_id?: string;
  p_transaction_details?: Record<string, any>;
}
```

### Supabase Client Helper

```typescript
// lib/supabase-orders.ts
import { supabase } from './supabase';
import type { 
  Order, 
  CreateOrderParams, 
  AddOrderItemParams,
  ProcessPaymentParams 
} from '../types/database.types';

export const OrdersAPI = {
  // Create new order
  createOrder: async (params: CreateOrderParams) => {
    const { data, error } = await supabase.rpc('create_order', params);
    if (error) throw error;
    return data;
  },

  // Add item to order
  addItem: async (params: AddOrderItemParams) => {
    const { data, error } = await supabase.rpc('add_order_item', params);
    if (error) throw error;
    return data;
  },

  // Update order status
  updateStatus: async (orderId: string, status: OrderStatus, reason?: string) => {
    const { data, error } = await supabase.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: status,
      p_reason: reason
    });
    if (error) throw error;
    return data;
  },

  // Calculate tax
  calculateTax: async (orderId: string, taxRate: number = 0.0825) => {
    const { data, error } = await supabase.rpc('calculate_order_tax', {
      p_order_id: orderId,
      p_tax_rate: taxRate
    });
    if (error) throw error;
    return data;
  },

  // Process payment
  processPayment: async (params: ProcessPaymentParams) => {
    const { data, error } = await supabase.rpc('process_payment', params);
    if (error) throw error;
    return data;
  },

  // Get order details
  getOrderDetails: async (orderId: string) => {
    const { data, error } = await supabase.rpc('get_order_details', {
      p_order_id: orderId
    });
    if (error) throw error;
    return data;
  },

  // Get orders for location
  getLocationOrders: async (locationId: string, statuses?: OrderStatus[]) => {
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*)
      `)
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Order[];
  },

  // Void order item
  voidItem: async (orderItemId: string, reason: string) => {
    const { data, error } = await supabase.rpc('void_order_item', {
      p_order_item_id: orderItemId,
      p_void_reason: reason
    });
    if (error) throw error;
    return data;
  }
};
```

---

## 💳 Payment Integration

### SPINAPI Integration (External Terminal)

```typescript
// lib/payments/spinapi.ts
interface SPINAPIRequest {
  transactionType: 'SALE' | 'RETURN' | 'VOID' | 'ADJUST';
  amount: number;
  tipAmount?: number;
  invoiceNumber: string;
  taxAmount?: number;
}

interface SPINAPIResponse {
  status: 'APPROVED' | 'DECLINED' | 'ERROR';
  transactionId: string;
  authCode: string;
  responseCode: string;
  responseMessage: string;
  cardType: string;
  lastFour: string;
  batchNumber: string;
  invoiceNumber: string;
}

export class SPINAPIClient {
  private terminalIP: string;
  private terminalPort: number;

  constructor(terminalIP: string, terminalPort: number = 8080) {
    this.terminalIP = terminalIP;
    this.terminalPort = terminalPort;
  }

  async processSale(request: SPINAPIRequest): Promise<SPINAPIResponse> {
    try {
      // Send HTTP request to Dejavoo terminal
      const response = await fetch(
        `http://${this.terminalIP}:${this.terminalPort}/transaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        }
      );

      if (!response.ok) {
        throw new Error('Terminal communication failed');
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      console.error('SPINAPI Error:', error);
      throw new Error('Failed to process payment with terminal');
    }
  }

  private parseResponse(data: any): SPINAPIResponse {
    return {
      status: data.ResponseCode === '00' ? 'APPROVED' : 'DECLINED',
      transactionId: data.TransactionId,
      authCode: data.AuthCode,
      responseCode: data.ResponseCode,
      responseMessage: data.ResponseMessage,
      cardType: data.CardType,
      lastFour: data.LastFour,
      batchNumber: data.BatchNumber,
      invoiceNumber: data.InvoiceNumber
    };
  }
}

// Usage
export const processCardPaymentSPINAPI = async (
  orderId: string,
  amount: number,
  tipAmount: number,
  orderNumber: string
) => {
  const spinApi = new SPINAPIClient('192.168.1.100'); // Terminal IP

  // Step 1: Process on terminal
  const terminalResponse = await spinApi.processSale({
    transactionType: 'SALE',
    amount: amount,
    tipAmount: tipAmount,
    invoiceNumber: orderNumber
  });

  if (terminalResponse.status !== 'APPROVED') {
    throw new Error(`Payment declined: ${terminalResponse.responseMessage}`);
  }

  // Step 2: Record in database
  const paymentResult = await OrdersAPI.processPayment({
    p_order_id: orderId,
    p_payment_method: 'card_spinapi',
    p_amount: amount,
    p_tip_amount: tipAmount,
    p_terminal_type: 'dejavoo_spinapi',
    p_terminal_id: 'TERM_001',
    p_transaction_details: {
      transaction_id: terminalResponse.transactionId,
      authorization_code: terminalResponse.authCode,
      card_type: terminalResponse.cardType,
      card_last_four: terminalResponse.lastFour,
      dejavoo_response_code: terminalResponse.responseCode,
      dejavoo_batch_number: terminalResponse.batchNumber
    }
  });

  return paymentResult;
};
```

### DVPaylite Integration (Native on P18)

```typescript
// lib/payments/dvpaylite.ts
import { Linking } from 'react-native';

interface DVPayLiteRequest {
  type: 'SALE' | 'RETURN' | 'VOID';
  applicationType: 'DVPAYLITE';
  amount: string; // In cents
  tipAmount?: string; // In cents
  refId: string;
  invoiceNumber: string;
}

interface DVPayLiteResponse {
  transactionResult: 'Success' | 'Failure';
  transactionId?: string;
  authCode?: string;
  cardType?: string;
  lastFour?: string;
  errorMessage?: string;
}

export class DVPayLiteClient {
  async processSale(
    amount: number,
    tipAmount: number,
    orderId: string,
    orderNumber: string
  ): Promise<DVPayLiteResponse> {
    // Build request
    const request: DVPayLiteRequest = {
      type: 'SALE',
      applicationType: 'DVPAYLITE',
      amount: Math.round(amount * 100).toString(), // Convert to cents
      tipAmount: Math.round(tipAmount * 100).toString(),
      refId: orderId,
      invoiceNumber: orderNumber
    };

    // Encode and build deep link
    const encodedRequest = encodeURIComponent(JSON.stringify(request));
    const deepLinkUrl = `pay://pay?data=${encodedRequest}`;

    // Launch DVPaylite
    const canOpen = await Linking.canOpenURL(deepLinkUrl);
    if (!canOpen) {
      throw new Error('DVPaylite app not installed');
    }

    await Linking.openURL(deepLinkUrl);

    // Return promise that resolves when DVPaylite returns
    return new Promise((resolve, reject) => {
      // Set up listener for DVPaylite callback
      const subscription = Linking.addEventListener('url', (event) => {
        const response = this.parseCallbackUrl(event.url);
        subscription.remove();
        
        if (response.transactionResult === 'Success') {
          resolve(response);
        } else {
          reject(new Error(response.errorMessage || 'Payment failed'));
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        subscription.remove();
        reject(new Error('Payment timeout'));
      }, 300000);
    });
  }

  private parseCallbackUrl(url: string): DVPayLiteResponse {
    // Parse callback URL from DVPaylite
    // Format: myapp://payment-result?data=<encoded_json>
    const params = new URLSearchParams(url.split('?')[1]);
    const data = params.get('data');
    
    if (!data) {
      throw new Error('Invalid callback from DVPaylite');
    }

    const decoded = JSON.parse(decodeURIComponent(data));
    return decoded;
  }
}

// Usage
export const processCardPaymentDVPayLite = async (
  orderId: string,
  amount: number,
  tipAmount: number,
  orderNumber: string
) => {
  const dvPayLite = new DVPayLiteClient();

  // Step 1: Process with DVPaylite
  const response = await dvPayLite.processSale(
    amount,
    tipAmount,
    orderId,
    orderNumber
  );

  // Step 2: Record in database
  const paymentResult = await OrdersAPI.processPayment({
    p_order_id: orderId,
    p_payment_method: 'card_dvpaylite',
    p_amount: amount,
    p_tip_amount: tipAmount,
    p_terminal_type: 'dejavoo_p18',
    p_transaction_details: {
      transaction_id: response.transactionId,
      authorization_code: response.authCode,
      card_type: response.cardType,
      card_last_four: response.lastFour,
      dvpaylite_request_id: orderId
    }
  });

  return paymentResult;
};
```

---

## ✅ Best Practices

### 1. Error Handling

```typescript
const createOrderSafely = async (params: CreateOrderParams) => {
  try {
    const result = await OrdersAPI.createOrder(params);
    return { success: true, data: result };
  } catch (error) {
    console.error('Order creation failed:', error);
    
    // Log to error tracking service
    logError('create_order_failed', { params, error });
    
    // Show user-friendly message
    showToast('Failed to create order. Please try again.');
    
    return { success: false, error };
  }
};
```

### 2. Offline Support

```typescript
// Store orders locally when offline
import AsyncStorage from '@react-native-async-storage/async-storage';

const syncOfflineOrders = async () => {
  const offlineOrders = await AsyncStorage.getItem('offline_orders');
  
  if (!offlineOrders) return;
  
  const orders = JSON.parse(offlineOrders);
  
  for (const order of orders) {
    try {
      await supabase.from('orders').insert({
        ...order,
        is_offline: true,
        last_synced_at: new Date().toISOString()
      });
      
      // Remove from offline storage
      await removeOfflineOrder(order.id);
    } catch (error) {
      console.error('Failed to sync order:', order.id, error);
    }
  }
};
```

### 3. Performance Optimization

```typescript
// Batch fetch with pagination
const fetchOrdersInBatches = async (locationId: string, limit: number = 50) => {
  let allOrders: Order[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('location_id', locationId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allOrders = [...allOrders, ...data];
    hasMore = data.length === limit;
    offset += limit;
  }

  return allOrders;
};

// Use React Query for caching
import { useQuery } from '@tanstack/react-query';

const useOrders = (locationId: string) => {
  return useQuery({
    queryKey: ['orders', locationId],
    queryFn: () => OrdersAPI.getLocationOrders(locationId),
    staleTime: 30000, // 30 seconds
    cacheTime: 300000, // 5 minutes
  });
};
```

### 4. Security

```typescript
// Always validate amounts on backend
const validatePaymentAmount = (orderTotal: number, paymentAmount: number) => {
  const tolerance = 0.01; // Allow 1 cent difference for rounding
  
  if (Math.abs(orderTotal - paymentAmount) > tolerance) {
    throw new Error('Payment amount does not match order total');
  }
};

// Never expose sensitive card data
const maskCardNumber = (cardNumber: string) => {
  return '**** **** **** ' + cardNumber.slice(-4);
};

// Use transaction IDs for idempotency
const processIdempotentPayment = async (transactionId: string, params: any) => {
  // Check if payment already processed
  const { data: existingPayment } = await supabase
    .from('order_payments')
    .select('id')
    .eq('transaction_id', transactionId)
    .single();

  if (existingPayment) {
    console.log('Payment already processed:', transactionId);
    return existingPayment;
  }

  // Process new payment
  return await OrdersAPI.processPayment(params);
};
```

### 5. Monitoring & Logging

```typescript
// Log all order operations
const logOrderOperation = async (
  operation: string,
  orderId: string,
  metadata: any
) => {
  await supabase.from('audit_logs').insert({
    actor_user_id: getCurrentUserId(),
    action: operation,
    action_category: 'order_management',
    resource_type: 'order',
    resource_name: orderId,
    metadata: metadata,
    status: 'success',
    created_at: new Date().toISOString()
  });
};

// Track payment processing time
const trackPaymentDuration = async (
  paymentMethod: string,
  duration: number
) => {
  // Send to analytics
  analytics.track('payment_processed', {
    method: paymentMethod,
    duration_ms: duration,
    timestamp: Date.now()
  });
};
```

---

## 🧪 Testing & Validation

### Unit Tests

```typescript
// tests/orders.test.ts
import { describe, it, expect } from 'vitest';
import { OrdersAPI } from '../lib/supabase-orders';

describe('Orders API', () => {
  it('should create order with valid data', async () => {
    const result = await OrdersAPI.createOrder({
      p_merchant_id: 'test-merchant-id',
      p_location_id: 'test-location-id',
      p_order_type: 'dine_in',
      p_table_number: '5'
    });

    expect(result.success).toBe(true);
    expect(result.order_id).toBeDefined();
    expect(result.order_number).toMatch(/^ORD-\d{8}-\d{4}$/);
  });

  it('should calculate tax correctly', async () => {
    const orderId = 'test-order-id';
    const taxRate = 0.0825; // 8.25%

    const result = await OrdersAPI.calculateTax(orderId, taxRate);

    expect(result.success).toBe(true);
    expect(result.tax_amount).toBeCloseTo(8.25, 2);
  });

  it('should reject negative payment amounts', async () => {
    await expect(
      OrdersAPI.processPayment({
        p_order_id: 'test-order-id',
        p_payment_method: 'cash',
        p_amount: -10.00
      })
    ).rejects.toThrow('Payment amount must be positive');
  });
});
```

### Integration Tests

```typescript
// tests/order-flow.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('Complete Order Flow', () => {
  let orderId: string;
  let merchantId: string;
  let locationId: string;

  beforeEach(async () => {
    // Setup test data
    merchantId = 'test-merchant';
    locationId = 'test-location';
  });

  it('should complete full order lifecycle', async () => {
    // 1. Create order
    const createResult = await OrdersAPI.createOrder({
      p_merchant_id: merchantId,
      p_location_id: locationId,
      p_order_type: 'dine_in',
      p_table_number: '12'
    });
    orderId = createResult.order_id;
    expect(createResult.success).toBe(true);

    // 2. Add items
    const addItemResult = await OrdersAPI.addItem({
      p_order_id: orderId,
      p_menu_item_id: 'test-item-id',
      p_quantity: 2
    });
    expect(addItemResult.success).toBe(true);

    // 3. Calculate tax
    const taxResult = await OrdersAPI.calculateTax(orderId, 0.0825);
    expect(taxResult.success).toBe(true);

    // 4. Send to kitchen
    const statusResult = await OrdersAPI.updateStatus(orderId, 'pending');
    expect(statusResult.success).toBe(true);

    // 5. Process payment
    const paymentResult = await OrdersAPI.processPayment({
      p_order_id: orderId,
      p_payment_method: 'cash',
      p_amount: 50.00
    });
    expect(paymentResult.success).toBe(true);

    // 6. Complete order
    const completeResult = await OrdersAPI.updateStatus(orderId, 'completed');
    expect(completeResult.success).toBe(true);
  });
});
```

### Manual Testing Checklist

- [ ] Create order on POS tablet
- [ ] Add multiple items with modifiers
- [ ] Verify real-time sync to admin dashboard
- [ ] Update order status from kitchen display
- [ ] Process cash payment
- [ ] Process card payment via SPINAPI
- [ ] Process card payment via DVPaylite
- [ ] Handle payment failure gracefully
- [ ] Test offline order creation
- [ ] Verify sync when coming back online
- [ ] Test concurrent order modifications
- [ ] Verify optimistic locking works
- [ ] Check audit trail completeness
- [ ] Validate RLS policies
- [ ] Test order search and filtering
- [ ] Verify reporting queries performance

---

## 📊 Common Queries

### Sales Reports

```sql
-- Daily sales by location
SELECT 
  l.name as location_name,
  DATE(o.created_at) as date,
  COUNT(o.id) as total_orders,
  SUM(o.subtotal) as subtotal,
  SUM(o.tax_amount) as tax,
  SUM(o.total_amount) as total_sales,
  AVG(o.total_amount) as avg_order_value
FROM orders o
JOIN locations l ON l.id = o.location_id
WHERE o.status = 'completed'
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY l.name, DATE(o.created_at)
ORDER BY date DESC, total_sales DESC;
```

### Popular Items

```sql
-- Top selling items
SELECT 
  oi.item_name,
  oi.category_name,
  COUNT(*) as times_ordered,
  SUM(oi.quantity) as total_quantity,
  SUM(oi.subtotal) as total_revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND oi.is_voided = FALSE
GROUP BY oi.item_name, oi.category_name
ORDER BY total_quantity DESC
LIMIT 20;
```

### Payment Method Breakdown

```sql
-- Payment methods analysis
SELECT 
  op.payment_method,
  COUNT(DISTINCT op.order_id) as order_count,
  SUM(op.amount) as total_amount,
  AVG(op.amount) as avg_amount,
  SUM(op.tip_amount) as total_tips
FROM order_payments op
WHERE op.status = 'captured'
  AND op.initiated_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY op.payment_method
ORDER BY total_amount DESC;
```

---

## 🚀 Deployment Checklist

- [ ] Run all SQL migration scripts
- [ ] Verify RLS policies are enabled
- [ ] Test all database functions
- [ ] Set up real-time subscriptions
- [ ] Configure payment terminal connections
- [ ] Test payment integrations (SPINAPI, DVPaylite, Cash)
- [ ] Enable audit logging
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Test offline mode
- [ ] Verify sync conflict resolution
- [ ] Load test with concurrent users
- [ ] Security audit of RLS policies
- [ ] Review and optimize database indexes
- [ ] Set up error tracking (Sentry, etc)
- [ ] Train staff on POS system
- [ ] Create runbook for common issues

---

## 📚 Additional Resources

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Dejavoo SPINAPI Docs](https://docs.dejavoo.com)
- [DVPaylite Integration Guide](https://docs.ipospays.com)
- [Row Level Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [TypeScript Database Types](https://supabase.com/docs/guides/api/generating-types)

---

## 🆘 Troubleshooting

### Order not syncing to admin dashboard
- Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'orders';`
- Verify user has correct location access
- Check Realtime subscription status
- Validate network connectivity

### Payment failing to process
- Verify terminal connection (SPINAPI)
- Check DVPaylite app installed (P18)
- Validate payment amount matches order total
- Review transaction logs in `order_payments` table

### Optimistic lock conflicts
- Implement retry logic with exponential backoff
- Add UI notification for conflicts
- Fetch latest order state before update

### Performance issues
- Add indexes on frequently queried columns
- Implement pagination for large result sets
- Use materialized views for reports
- Consider read replicas for reporting queries

---

**Created by:** DEXA POS Development Team
**Last Updated:** December 2024
**Version:** 1.0.0