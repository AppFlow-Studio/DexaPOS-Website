'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { MultiFileUpload } from '@/components/ui/multi-file-upload'
import { useGatedLocationId, useGatedLocation } from '@/stores/location-store'
import { MapPin, Loader2, Trash2, Save, Info } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuth } from '@clerk/nextjs'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Accept, FileRejection } from 'react-dropzone'
import {
    deleteCdnAsset,
    extractStoragePathFromCdnUrl,
    fileToBase64,
    generateCdnFileName,
    optimizeImageForCdn,
    uploadCdnAsset,
} from '@/lib/cdn/client'
import {
    LocationIndicator,
    PageHeader,
} from '@/components/dashboard/shell'

// Types
interface CfdImage {
    id: string
    location_id: string
    image_url: string
    display_order: number
    is_active: boolean
    created_at: string
}

const CFD_UPLOAD_ACCEPT = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
} satisfies Accept

const CFD_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const CFD_TARGET_FILE_SIZE_BYTES = 500 * 1024

function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }

    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)} KB`
    }

    return `${bytes} B`
}

function buildRejectedFilesMessage(rejections: FileRejection[]) {
    const rejectedNames = rejections.map(({ file }) => file.name).join(', ')
    const reasons = new Set<string>()

    for (const rejection of rejections) {
        for (const error of rejection.errors) {
            if (error.code === 'file-invalid-type') {
                reasons.add('Only JPG, PNG, and WEBP images are allowed')
            } else if (error.code === 'file-too-large') {
                reasons.add(`Each image must be ${formatBytes(CFD_MAX_FILE_SIZE_BYTES)} or smaller`)
            } else {
                reasons.add(error.message)
            }
        }
    }

    return `${Array.from(reasons).join('. ')}. Rejected: ${rejectedNames}`
}

export default function CustomerDisplaySettingsPage() {
    // Resolve to the gated location so single-location accounts (locked to 'all')
    // skip the "Select a Location" prompt. Multi-location on 'all' -> null.
    const gatedLocationId = useGatedLocationId()
    const selectedLocationId = gatedLocationId ?? 'all'
    const isAllLocations = !gatedLocationId
    const selectedLocation = useGatedLocation()
    const { getToken } = useAuth()
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

    const [images, setImages] = React.useState<CfdImage[]>([])
    const [loading, setLoading] = React.useState(true)
    const [uploading, setUploading] = React.useState(false)
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
    const [deleteId, setDeleteId] = React.useState<string | null>(null)

    // ... fetchImages logic (unchanged)

    const fetchImages = React.useCallback(async () => {
        if (!selectedLocationId || isAllLocations) return

        try {
            setLoading(true)
            // Use authenticated client for fetch too, just in case policies change
            const token = await getToken({ template: 'supabase' }).catch(() => null) || await getToken()
            
            const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
                global: {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                }
            })

            const { data, error } = await supabase
                .from('cfd_carousel_images')
                .select('*')
                .eq('location_id', selectedLocationId)
                .order('display_order', { ascending: true })

            if (error) throw error
            setImages(data || [])
        } catch (error) {
            console.error('Error fetching images:', error)
            toast.error('Failed to load images')
        } finally {
            setLoading(false)
        }
    }, [selectedLocationId, isAllLocations, getToken, supabaseUrl, supabaseKey])

    React.useEffect(() => {
        fetchImages()
    }, [fetchImages])

    // Handle File Selection
    const handleFileChange = (files: File[]) => {
        setSelectedFiles(files)
    }

    const handleRejectedFiles = (rejections: FileRejection[]) => {
        if (rejections.length === 0) return
        toast.error(buildRejectedFilesMessage(rejections))
    }

    // Handle Upload
    const handleUpload = async () => {
        if (selectedFiles.length === 0 || !selectedLocationId || !selectedLocation?.merchant_id) return

        try {
            setUploading(true)
            
            // Get Authenticated Client
            const token = await getToken({ template: 'supabase' }).catch(() => null) || await getToken()
            const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
                global: {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                }
            })
            
            // Get current max order to append sequentially
            let currentMaxOrder = images.length > 0 
                ? Math.max(...images.map(img => img.display_order)) 
                : 0

            let successCount = 0;
            let errors: string[] = [];
            let optimizedCount = 0;
            let totalBytesSaved = 0;

            // Process files
            for (const file of selectedFiles) {
                try {
                    const optimizedFile = await optimizeImageForCdn(file, {
                        targetBytes: CFD_TARGET_FILE_SIZE_BYTES,
                    })

                    if (optimizedFile.wasOptimized) {
                        optimizedCount++
                        totalBytesSaved += Math.max(
                            0,
                            optimizedFile.originalSize - optimizedFile.optimizedSize,
                        )
                    }

                    const fileName = generateCdnFileName('carousel', optimizedFile.extension)
                    const fileBase64 = await fileToBase64(optimizedFile.file)
                    const uploadResult = await uploadCdnAsset(supabase, {
                        scope: 'merchant',
                        merchantId: selectedLocation.merchant_id,
                        category: 'cfd-images',
                        fileName,
                        fileBase64,
                        contentType: optimizedFile.contentType,
                    })

                    currentMaxOrder++; // Increment for next item
                    const { error: dbError } = await supabase
                        .from('cfd_carousel_images')
                        .insert({
                            location_id: selectedLocationId,
                            image_url: uploadResult.cdnUrl,
                            display_order: currentMaxOrder,
                            is_active: true
                        })

                    if (dbError) {
                        try {
                            await deleteCdnAsset(supabase, {
                                scope: 'merchant',
                                merchantId: selectedLocation.merchant_id,
                                storagePath: uploadResult.storagePath,
                            })
                        } catch (cleanupError) {
                            console.warn('Failed to clean up Bunny asset after CFD DB insert failure:', cleanupError)
                        }

                        throw dbError
                    }
                    successCount++;

                } catch (err: any) {
                    console.error(`Error uploading ${file.name}:`, err);
                    errors.push(file.name);
                }
            }

            if (successCount > 0) {
                const optimizationMessage = optimizedCount > 0
                    ? ` Optimized ${optimizedCount} image(s) and saved ${formatBytes(totalBytesSaved)} before upload.`
                    : ''

                toast.success(`${successCount} image(s) uploaded successfully.${optimizationMessage}`)
                setSelectedFiles([]) // Clear selection on success
                fetchImages()
            }
            
            if (errors.length > 0) {
                toast.error(`Failed to upload: ${errors.join(', ')}`)
            }

        } catch (error: any) {
            console.error('Error uploading batch:', error)
            toast.error(`Batch upload failed: ${error.message || 'Unknown error'}`)
        } finally {
            setUploading(false)
        }
    }

    // Handle Toggle Active
    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        try {
            // Optimistic update
            setImages(prev => prev.map(img => 
                img.id === id ? { ...img, is_active: !currentStatus } : img
            ))

            const token = await getToken({ template: 'supabase' }).catch(() => null) || await getToken()
            const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
                global: { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            })

            const { error } = await supabase
                .from('cfd_carousel_images')
                .update({ is_active: !currentStatus })
                .eq('id', id)

            if (error) {
                // Revert on error
                setImages(prev => prev.map(img => 
                    img.id === id ? { ...img, is_active: currentStatus } : img
                ))
                throw error
            }
        } catch (error) {
            console.error('Error updating status:', error)
            toast.error('Failed to update status')
        }
    }

    // Handle Delete
    const handleDelete = async () => {
        if (!deleteId) return

        const imageToDelete = images.find(img => img.id === deleteId)
        if (!imageToDelete || !selectedLocation?.merchant_id) return

        try {
            const token = await getToken({ template: 'supabase' }).catch(() => null) || await getToken()
            const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
                global: { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            })

            // 1. Delete from Bunny CDN when the image is already migrated.
            // 2. Fall back to legacy Supabase storage cleanup for pre-migration URLs.
            try {
                const url = new URL(imageToDelete.image_url)

                if (
                    url.pathname.startsWith('/merchants/') ||
                    url.pathname.startsWith('/organizations/')
                ) {
                    const storagePath = extractStoragePathFromCdnUrl(imageToDelete.image_url)
                    await deleteCdnAsset(supabase, {
                        scope: 'merchant',
                        merchantId: selectedLocation.merchant_id,
                        storagePath,
                    })
                } else {
                    const pathParts = url.pathname.split('/cfd-images/')

                    if (pathParts.length > 1) {
                        const storagePath = decodeURIComponent(pathParts[1])
                        const { error: storageError } = await supabase.storage
                            .from('cfd-images')
                            .remove([storagePath])

                        if (storageError) {
                            console.error('Storage delete error:', storageError)
                            toast.warning('Could not delete file from storage, but removing record.')
                        }
                    }
                }
            } catch (e) {
                console.warn('Error deleting backing file during CFD image delete:', e)
            }

            // 2. Delete from DB
            const { error: dbError } = await supabase
                .from('cfd_carousel_images')
                .delete()
                .eq('id', deleteId)

            if (dbError) throw dbError

            setImages(prev => prev.filter(img => img.id !== deleteId))
            toast.success('Image deleted successfully')
        } catch (error: any) {
            console.error('Error deleting image:', error)
            toast.error(`Failed to delete image: ${error.message}`)
        } finally {
            setDeleteId(null)
        }
    }

    // ========================================================================
    // Render: All Locations View (Blocked)
    // ========================================================================

    if (isAllLocations) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Customer display"
                    subtitle="Manage images shown on the customer-facing display."
                    indicator={<LocationIndicator isAllLocations locationName={null} />}
                />

                <Card>
                    <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                        <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
                        <p className="text-muted-foreground max-w-md">
                            Customer Display settings are location-specific. Please select a location from the dropdown above to
                            manage images for that location.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ========================================================================
    // Render: Location-Specific View
    // ========================================================================

    return (
        <div className="space-y-6">
            <PageHeader
                title="Customer display"
                subtitle="Upload and manage the carousel shown to customers."
                indicator={
                    <LocationIndicator
                        isAllLocations={false}
                        locationName={selectedLocation?.name}
                    />
                }
            />

            {/* Upload Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Upload New Images</CardTitle>
                    <CardDescription>
                        Upload JPG, PNG, or WEBP images. Large images are resized and converted to WEBP before upload, targeting about 500 KB when possible.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <MultiFileUpload 
                        onChange={handleFileChange} 
                        value={selectedFiles}
                        accept={CFD_UPLOAD_ACCEPT}
                        maxSize={CFD_MAX_FILE_SIZE_BYTES}
                        onRejected={handleRejectedFiles}
                    />

                    <p className="text-xs text-muted-foreground">
                        Max file size: {formatBytes(CFD_MAX_FILE_SIZE_BYTES)} per image. Unsupported file types are rejected before upload.
                    </p>
                    
                    {selectedFiles.length > 0 && (
                        <div className="flex items-center justify-end gap-2">
                             <Button 
                                onClick={handleUpload} 
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Optimizing and uploading {selectedFiles.length} file(s)...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Upload {selectedFiles.length} Image(s)
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Gallery Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Gallery ({images.length})</h3>
                    <Alert className="max-w-xl py-2">
                        <Info className="h-4 w-4" />
                        <AlertTitle className="text-sm font-medium">Auto-Refresh</AlertTitle>
                        <AlertDescription className="text-xs">
                            Active images will automatically appear on the Customer Display app.
                        </AlertDescription>
                    </Alert>
                </div>

                {loading ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : images.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">No images uploaded yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {images.map((image) => (
                            <Card key={image.id} className="overflow-hidden group">
                                <div className="relative aspect-video bg-muted">
                                    <Image
                                        src={image.image_url}
                                        alt="CFD Image"
                                        fill
                                        className={`object-cover transition-opacity ${image.is_active ? 'opacity-100' : 'opacity-60 grayscale'}`}
                                    />
                                    <div className="absolute top-2 right-2 flex gap-2">
                                        <div className="bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm">
                                            <Switch
                                                checked={image.is_active}
                                                onCheckedChange={() => handleToggleActive(image.id, image.is_active)}
                                                className="data-[state=checked]:bg-green-600"
                                            />
                                        </div>
                                    </div>
                                    {/* Status Badge */}
                                    <div className="absolute bottom-2 left-2">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            image.is_active 
                                                ? 'bg-green-500/90 text-white' 
                                                : 'bg-gray-500/90 text-white'
                                        }`}>
                                            {image.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </div>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="text-sm text-muted-foreground">
                                        Added: {new Date(image.created_at).toLocaleDateString()}
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => setDeleteId(image.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Global Delete Confirmation Handler - if needed, but per-item alert dialog is easier. 
                Wait, the above AlertDialog is inside the map, so it works per item.
                However, I need to make sure the onClick on Action actually triggers the delete.
                The standard way:
             */}
             <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Image?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the image from the gallery.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
