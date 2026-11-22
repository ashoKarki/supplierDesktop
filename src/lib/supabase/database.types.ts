type Company = {
  id: string;
  name: string;
  country: string;
  business_details: string;
  created_at: string;
};

type CompanyTrial = {
  company_id: string;
  started_at: string;
  ends_at: string;
};

type Profile = {
  user_id: string;
  name: string;
};

type CompanyMembership = {
  company_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type OwnerEnrollment = {
  user_id: string;
  company_id: string;
};

type Supplier = {
  id: string;
  company_id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
};

type DocumentRequirement = {
  id: string;
  company_id: string;
  name: string;
  renewal_months: number;
  created_at: string;
};

type DocumentRequest = {
  id: string;
  company_id: string;
  supplier_id: string;
  created_at: string;
};

type DocumentRequestItem = {
  id: string;
  company_id: string;
  request_id: string;
  requirement_id: string;
  status: string;
  expires_on: string | null;
  created_at: string;
};

type DocumentVersion = {
  id: string;
  company_id: string;
  item_id: string;
  version_number: number;
  storage_path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  expires_on: string | null;
  submitted_by: string | null;
  created_at: string;
};

type DocumentReviewEvent = {
  id: string;
  company_id: string;
  item_id: string;
  version_id: string;
  status: string;
  actor_id: string | null;
  reason: string | null;
  expires_on: string | null;
  created_at: string;
};

type SupplierUploadLink = {
  id: string;
  company_id: string;
  request_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      company_trials: {
        Row: CompanyTrial;
        ComputedFields: never;
        Insert: Pick<CompanyTrial, "company_id"> & Partial<Pick<CompanyTrial, "started_at" | "ends_at">>;
        Update: Partial<CompanyTrial>;
        Relationships: [{
          foreignKeyName: "company_trials_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: true;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }];
      };
      companies: {
        Row: Company;
        ComputedFields: never;
        Insert: Omit<Company, "id" | "created_at"> & Partial<Pick<Company, "id" | "created_at">>;
        Update: Partial<Company>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        ComputedFields: never;
        Insert: Profile;
        Update: Partial<Profile>;
        Relationships: [];
      };
      company_memberships: {
        Row: CompanyMembership;
        ComputedFields: never;
        Insert: Omit<CompanyMembership, "created_at"> & Partial<Pick<CompanyMembership, "created_at">>;
        Update: Partial<CompanyMembership>;
        Relationships: [{
          foreignKeyName: "company_memberships_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }];
      };
      owner_enrollments: {
        Row: OwnerEnrollment;
        ComputedFields: never;
        Insert: OwnerEnrollment;
        Update: Partial<OwnerEnrollment>;
        Relationships: [{
          foreignKeyName: "owner_enrollments_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: true;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }];
      };
      suppliers: {
        Row: Supplier;
        ComputedFields: never;
        Insert: Pick<Supplier, "company_id" | "name"> & Partial<Omit<Supplier, "company_id" | "name">>;
        Update: Partial<Supplier>;
        Relationships: [{
          foreignKeyName: "suppliers_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }];
      };
      document_requirements: {
        Row: DocumentRequirement;
        ComputedFields: never;
        Insert: Pick<DocumentRequirement, "company_id" | "name" | "renewal_months"> & Partial<Pick<DocumentRequirement, "id" | "created_at">>;
        Update: Partial<DocumentRequirement>;
        Relationships: [{
          foreignKeyName: "document_requirements_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }];
      };
      document_requests: {
        Row: DocumentRequest;
        ComputedFields: never;
        Insert: Pick<DocumentRequest, "company_id" | "supplier_id"> & Partial<Pick<DocumentRequest, "id" | "created_at">>;
        Update: Partial<DocumentRequest>;
        Relationships: [{
          foreignKeyName: "document_requests_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "document_requests_company_id_supplier_id_fkey";
          columns: ["company_id", "supplier_id"];
          isOneToOne: false;
          referencedRelation: "suppliers";
          referencedColumns: ["company_id", "id"];
        }];
      };
      document_request_items: {
        Row: DocumentRequestItem;
        ComputedFields: never;
        Insert: Pick<DocumentRequestItem, "company_id" | "request_id" | "requirement_id"> & Partial<Pick<DocumentRequestItem, "id" | "created_at" | "status" | "expires_on">>;
        Update: Partial<DocumentRequestItem>;
        Relationships: [{
          foreignKeyName: "document_request_items_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "document_request_items_company_id_request_id_fkey";
          columns: ["company_id", "request_id"];
          isOneToOne: false;
          referencedRelation: "document_requests";
          referencedColumns: ["company_id", "id"];
        }, {
          foreignKeyName: "document_request_items_company_id_requirement_id_fkey";
          columns: ["company_id", "requirement_id"];
          isOneToOne: false;
          referencedRelation: "document_requirements";
          referencedColumns: ["company_id", "id"];
        }];
      };
      document_versions: {
        Row: DocumentVersion;
        ComputedFields: never;
        Insert: Omit<DocumentVersion, "created_at" | "expires_on" | "submitted_by"> & Partial<Pick<DocumentVersion, "created_at" | "expires_on" | "submitted_by">>;
        Update: Partial<DocumentVersion>;
        Relationships: [{
          foreignKeyName: "document_versions_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "document_versions_company_id_item_id_fkey";
          columns: ["company_id", "item_id"];
          isOneToOne: false;
          referencedRelation: "document_request_items";
          referencedColumns: ["company_id", "id"];
        }];
      };
      document_review_events: {
        Row: DocumentReviewEvent;
        ComputedFields: never;
        Insert: Omit<DocumentReviewEvent, "id" | "created_at" | "actor_id" | "reason" | "expires_on"> & Partial<Pick<DocumentReviewEvent, "id" | "created_at" | "actor_id" | "reason" | "expires_on">>;
        Update: Partial<DocumentReviewEvent>;
        Relationships: [{
          foreignKeyName: "document_review_events_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "document_review_events_company_id_item_id_version_id_fkey";
          columns: ["company_id", "item_id", "version_id"];
          isOneToOne: false;
          referencedRelation: "document_versions";
          referencedColumns: ["company_id", "item_id", "id"];
        }];
      };
      supplier_upload_links: {
        Row: SupplierUploadLink;
        ComputedFields: never;
        Insert: Omit<SupplierUploadLink, "id" | "created_at" | "revoked_at"> & Partial<Pick<SupplierUploadLink, "id" | "created_at" | "revoked_at">>;
        Update: Partial<SupplierUploadLink>;
        Relationships: [{
          foreignKeyName: "supplier_upload_links_company_id_fkey";
          columns: ["company_id"];
          isOneToOne: false;
          referencedRelation: "companies";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "supplier_upload_links_company_id_request_id_fkey";
          columns: ["company_id", "request_id"];
          isOneToOne: false;
          referencedRelation: "document_requests";
          referencedColumns: ["company_id", "id"];
        }];
      };
    };
    Views: Record<never, never>;
    Functions: {
      _store_document_version: {
        Args: {
          target_company: string;
          target_item: string;
          new_version: string;
          file_name: string;
          media_type: string;
          file_size: number;
          expiration: string | null;
          actor: string | null;
        };
        Returns: string;
      };
      create_document_request: {
        Args: { target_company: string; target_supplier: string; requirement_ids: string[] };
        Returns: string;
      };
      create_owner_workspace: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      record_document_upload: {
        Args: {
          target_company: string;
          target_item: string;
          new_version: string;
          file_name: string;
          media_type: string;
          file_size: number;
          expiration: string | null;
          submitted_by: string;
        };
        Returns: string;
      };
      record_supplier_document_upload: {
        Args: {
          target_company: string;
          target_item: string;
          new_version: string;
          file_name: string;
          media_type: string;
          file_size: number;
          expiration: string | null;
          link_hash: string;
        };
        Returns: string;
      };
      create_supplier_upload_link: {
        Args: { target_company: string; target_request: string };
        Returns: string;
      };
      revoke_supplier_upload_link: {
        Args: { target_company: string; target_link: string };
        Returns: undefined;
      };
      resolve_supplier_upload_link: {
        Args: { link_hash: string };
        Returns: { company_id: string; request_id: string; expires_at: string }[];
      };
      review_document: {
        Args: {
          target_company: string;
          target_item: string;
          target_version: string;
          next_status: string;
          decision_reason: string | null;
          revised_expiry: string | null;
        };
        Returns: undefined;
      };
      has_company_role: {
        Args: { target_company: string; allowed_roles: string[] };
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
