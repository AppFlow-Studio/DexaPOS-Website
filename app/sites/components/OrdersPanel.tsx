"use client";

import { motion } from "framer-motion";
import { Receipt, Clock, Sparkles } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function OrdersPanel() {
  // TODO: Integrate with actual order tracking system
  // For now, show a placeholder

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center pb-8"
    >
      <motion.div variants={itemVariants} className="relative">
        {/* Decorative background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-gradient-to-br from-[var(--primary)]/10 to-[var(--secondary)]/10 blur-3xl" />
        </div>

        {/* Icon container */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 10, stiffness: 200 }}
          className="relative mx-auto mb-6"
        >
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-lg">
            <Receipt className="h-12 w-12 text-gray-400" />
          </div>

          {/* Floating sparkle */}
          <motion.div
            animate={{
              y: [-5, 5, -5],
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute -top-2 -right-2"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-400/30">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
          </motion.div>
        </motion.div>

        {/* Content */}
        <motion.h2
          variants={itemVariants}
          className="text-2xl font-bold text-gray-900 mb-3"
        >
          Track Your Orders
        </motion.h2>

        <motion.p
          variants={itemVariants}
          className="text-gray-500 max-w-sm mx-auto mb-8 leading-relaxed"
        >
          Once you place an order, you&apos;ll be able to track its progress in
          real-time right here.
        </motion.p>

        {/* Status hint */}
        <motion.div
          variants={itemVariants}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-600 text-sm font-medium"
        >
          <Clock className="h-4 w-4" />
          <span>No active orders</span>
        </motion.div>
      </motion.div>

      {/* Coming soon features */}
      <motion.div variants={itemVariants} className="mt-12 max-w-sm">
        <p className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-semibold">
          Coming Soon
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "📍", label: "Live tracking" },
            { icon: "🔔", label: "Notifications" },
            { icon: "📜", label: "Order history" },
          ].map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + index * 0.1 }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-gray-100 shadow-sm"
            >
              <span className="text-2xl">{feature.icon}</span>
              <span className="text-xs text-gray-600 font-medium">
                {feature.label}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
