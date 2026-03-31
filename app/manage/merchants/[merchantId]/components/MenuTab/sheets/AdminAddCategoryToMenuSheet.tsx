'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Tag,
  Globe,
  MapPin,
  Search,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Admin Hooks & Actions
import { useAdminCategories } from '@/lib/queries/use-admin-merchant'
import { addCategoryToMenu } from '@/app/manage/actions/admin-merchant/menus'

interface AdminAddCategoryToMenuSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  menu: { id: string; name: string; categories?: { category_id: string }[] } | null
  onSuccess: () => void
}

export function AdminAddCategoryToMenuSheet({
  open,
  onClose,
  merchantId,
  locationId,
  menu,
  onSuccess,
}: AdminAddCategoryToMenuSheetProps) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Fetch all available categories for the merchant
  // Note: We fetch ALL categories (locationId: null) to give the admin full visibility of the library,
  // unless we are in a specific location view, then we might want to be more specific.
  // Generally admins want to see everything available to link.
  // Passing locationId will filter to Global + Location specific ones.
  const { data: allCategories, isLoading } = useAdminCategories(merchantId, locationId)

  // Identify categories already in the menu
  const alreadyInMenu = useMemo(() => {
    if (!menu?.categories) return new Set<string>()
    return new Set(menu.categories.map((c) => c.category_id))
  }, [menu?.categories])

  // Filter categories:
  // 1. Exclude those already in the menu
  // 2. Apply search query
  const availableCategories = useMemo(() => {
    if (!allCategories) return []
    
    return allCategories.filter((cat) => !alreadyInMenu.has(cat.id))
  }, [allCategories, alreadyInMenu])

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return availableCategories

    const query = searchQuery.toLowerCase()
    return availableCategories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(query) ||
        cat.description?.toLowerCase().includes(query)
    )
  }, [availableCategories, searchQuery])

  // Reset state when sheet opens/closes or menu changes
  useEffect(() => {
    if (!open) {
      setSelectedCategories(new Set())
      setSearchQuery('')
    }
  }, [open, menu])

  const handleToggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleSelectAll = (categoryIds: string[]) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      categoryIds.forEach((id) => next.add(id))
      return next
    })
  }

  const handleDeselectAll = (categoryIds: string[]) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      categoryIds.forEach((id) => next.delete(id))
      return next
    })
  }

  const handleSave = async () => {
    if (!menu) return
    if (selectedCategories.size === 0) {
      toast.error('No categories selected')
      return
    }

    setIsSaving(true)
    try {
      // Execute additions in parallel
      // Ideally we'd have a bulk_add endpoint, but loop is fine for reasonable admin usage
      const results = await Promise.allSettled(
        Array.from(selectedCategories).map((categoryId) =>
          addCategoryToMenu(merchantId, menu.id, categoryId, 0) // Default display order 0
        )
      )

      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
      const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.success)

      if (failed.length > 0) {
        toast.error('Some categories failed to add', {
          description: `${failed.length} failed, ${succeeded.length} added.`,
        })
      } else {
        toast.success('Categories Added', {
          description: `${succeeded.length} category(ies) added to menu.`,
        })
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Failed to add categories to menu:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  // Group by Global vs Location for better UX
  const globalCategories = filteredCategories.filter((c) => c.is_global)
  const locationCategories = filteredCategories.filter((c) => !c.is_global)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-4xl"
      >
        <div className="flex max-h-[min(88vh,820px)] flex-col">
          <DialogHeader className="gap-2 border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
            <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
              <Tag className="h-5 w-5 text-primary" />
              Add Existing Categories
            </DialogTitle>
            <DialogDescription className="max-w-[60ch] text-sm leading-6">
              Select existing categories to link to <strong>{menu?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
            {/* Search Bar */}
            <div className="border-b border-border/70 px-6 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Selection Summary */}
              {selectedCategories.size > 0 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    {selectedCategories.size} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCategories(new Set())}
                    className="h-auto p-0 px-2 text-muted-foreground hover:text-foreground"
                  >
                    Clear Selection
                  </Button>
                </div>
              )}
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading categories...
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No available categories found.</p>
                  <p className="text-xs mt-1">
                    {searchQuery
                      ? 'Try adjusting your search filters.'
                      : 'All existing categories might already be in this menu.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Global Categories Section */}
                  {globalCategories.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-semibold">Global Categories</Label>
                          <Badge variant="secondary" className="text-xs">
                            {globalCategories.length}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                             const ids = globalCategories.map(c => c.id)
                             // Simple toggle logic: if all selected, deselect. Else select all.
                             const allSelected = ids.every(id => selectedCategories.has(id))
                             if (allSelected) handleDeselectAll(ids)
                             else handleSelectAll(ids)
                          }}
                        >
                          Select All
                        </Button>
                      </div>
                      
                      <div className="grid gap-2">
                        {globalCategories.map((cat) => {
                          const isSelected = selectedCategories.has(cat.id)
                          return (
                            <div
                              key={cat.id}
                              onClick={() => handleToggleCategory(cat.id)}
                              className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-muted hover:border-primary/50"
                              )}
                            >
                              <div className={cn(
                                "flex-shrink-0 mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                              )}>
                                {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{cat.name}</div>
                                {cat.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {cat.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-1.5">
                                   <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-background">
                                     {cat.items_count} items
                                   </Badge>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Location Categories Section */}
                  {locationCategories.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-semibold">Location Categories</Label>
                           <Badge variant="secondary" className="text-xs">
                            {locationCategories.length}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                             const ids = locationCategories.map(c => c.id)
                             const allSelected = ids.every(id => selectedCategories.has(id))
                             if (allSelected) handleDeselectAll(ids)
                             else handleSelectAll(ids)
                          }}
                        >
                          Select All
                        </Button>
                      </div>

                      <div className="grid gap-2">
                        {locationCategories.map((cat) => {
                          const isSelected = selectedCategories.has(cat.id)
                          return (
                             <div
                              key={cat.id}
                              onClick={() => handleToggleCategory(cat.id)}
                              className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-muted hover:border-primary/50"
                              )}
                            >
                              <div className={cn(
                                "flex-shrink-0 mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                              )}>
                                {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm flex items-center gap-2">
                                  {cat.name}
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 bg-purple-50 text-purple-700 border-purple-200">
                                    {cat.location_name || 'Location'}
                                  </Badge>
                                </div>
                                {cat.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {cat.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-1.5">
                                   <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-background">
                                     {cat.items_count} items
                                   </Badge>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
           <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || selectedCategories.size === 0}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              `Add ${selectedCategories.size} Categories`
            )}
          </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
