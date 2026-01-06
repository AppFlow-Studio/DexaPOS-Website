"use client";

import { useState, useEffect } from "react";
import {
  StorefrontMenu,
  StorefrontItem,
  StorefrontCategory,
} from "@/types/storefront";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../hooks/useCart";
import { ItemDetailsModal } from "./ItemDetailsModal";

interface MenuBrowserProps {
  menus: StorefrontMenu[];
}

export function MenuBrowser({ menus }: MenuBrowserProps) {
  const [activeMenuId, setActiveMenuId] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (menus.length > 0 && !activeMenuId) {
      setActiveMenuId(menus[0].id);
    }
  }, [menus, activeMenuId]);

  const activeMenu = menus.find((m) => m.id === activeMenuId);

  // Auto-set the first category as active when menu changes
  useEffect(() => {
    if (activeMenu?.categories?.length) {
      setActiveCategory(activeMenu.categories[0].id);
    }
  }, [activeMenu]);

  const handleItemClick = (item: StorefrontItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  if (!activeMenu || menus.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted rounded-full p-4 mb-4">
          <Info className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold">No menus available</h3>
        <p className="text-muted-foreground mt-2">
          This location hasn't set up their online menu yet.
        </p>
      </div>
    );
  }

  const categories = activeMenu.categories;

  return (
    <div className="space-y-6">
      <ItemDetailsModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Top Menu Tabs */}
      {menus.length > 1 && (
        <div className="flex overflow-x-auto pb-1 gap-2 border-b no-scrollbar sticky top-[64px] z-30 bg-gray-50/95 pt-2">
          {menus.map((menu) => (
            <button
              key={menu.id}
              onClick={() => setActiveMenuId(menu.id)}
              className={cn(
                "px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-[1px]",
                activeMenuId === menu.id
                  ? "border-[var(--primary)] text-[var(--primary)] bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
              )}
            >
              {menu.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 relative items-start">
        {/* Mobile Sticky Category Nav */}
        <div className="lg:hidden sticky top-[110px] z-20 bg-gray-50/95 backdrop-blur-sm -mx-4 px-4 py-3 flex overflow-x-auto no-scrollbar gap-2 shadow-sm border-b">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium whitespace-nowrap rounded-full transition-all border",
                activeCategory === cat.id
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 shadow-sm"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Desktop Sidebar Nav */}
        <aside className="hidden lg:block w-64 sticky top-32 shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto pr-4">
          <h3 className="font-bold text-lg mb-4 px-2 text-gray-900">
            Categories
          </h3>
          <nav className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activeCategory === cat.id
                    ? "bg-white text-[var(--primary)] shadow-sm border-l-4 border-[var(--primary)]"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-12 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMenu.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {categories.map((category) => (
                <section
                  key={category.id}
                  id={`category-${category.id}`}
                  className="scroll-mt-32 mb-10"
                >
                  <div className="mb-6 border-b pb-2">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                      {category.name}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {category.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onClick={() => handleItemClick(item)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onClick,
}: {
  item: StorefrontItem;
  onClick: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { addItem } = useCart();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="group bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 overflow-hidden flex flex-row cursor-pointer h-32"
    >
      {/* Content Side */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          <h4 className="font-bold text-gray-900 dark:text-gray-100 text-base mb-1 group-hover:text-[var(--primary)] transition-colors line-clamp-1">
            {item.name}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 h-8">
            {item.description}
          </p>
        </div>

        <div className="flex items-center justify-between mt-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            ${item.price.toFixed(2)}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full w-8 h-8 p-0"
            // The Button just triggers the parent onClick because of bubbling, which is fine.
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Image Side */}
      {item.image && (
        <div className="w-32 h-full shrink-0">
          <div className="h-full w-full bg-gray-100 relative">
            <img
              src={item.image}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
