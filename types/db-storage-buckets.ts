export interface DbStorageBucketInfo {
    name: string          // Supabase storage bucket name
    public: boolean       // True if bucket is public, false if private
    description: string   // What it's used for
}

const dbStorageBuckets: Record<string, DbStorageBucketInfo> = {
    "Organizations-Logos": {
        name: 'Organizations-Logos',
        public: true,
        description: 'Bucket for organization profile images, logos, and related public assets',
    },
    
}