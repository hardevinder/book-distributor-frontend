"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import Swal from "sweetalert2";
import {
  Pencil,
  Trash2,
  BookOpen,
  Upload,
  Download,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

/* ---------- Types ---------- */

type Publisher = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  // ✅ backend has address (not city)
  address?: string | null;
};

type Supplier = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  // ✅ backend has address (not city)
  address?: string | null;
};

type ClassItem = {
  id: number;
  class_name: string;
  sort_order: number;
  is_active: boolean;
};

type School = { id: number; name: string };

type Book = {
  id: number;
  title: string;
  class_name?: string | null;
  subject?: string | null;
  publisher_id?: number | null;
  publisher?: Publisher | null;
};

type Requirement = {
  id: number;
  school_id: number;
  book_id: number;
  supplier_id?: number | null;
  class_id?: number | null;
  academic_session?: string | null;
  required_copies: number | string;
  status: "draft" | "confirmed";
  remarks?: string | null;
  is_locked: boolean;

  school?: School | null;
  supplier?: Supplier | null;
  book?: Book | null;
  class?: ClassItem | null;
};

type RequirementRowFormState = {
  school_name: string;
  supplier_name: string;
  publisher_name: string;
  book_title: string;
  class_name: string;
  academic_session: string;
  required_copies: string;
  status: "draft" | "confirmed";
  is_locked: boolean;
};

type PendingItem = RequirementRowFormState & { tempId: number };

/* ---------- Session Defaults ---------- */

const DEFAULT_SESSION = "2026-27";

const SESSION_OPTIONS: string[] = (() => {
  const base = 2026;
  const arr: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const y1 = base + i;
    const y2Short = String((y1 + 1) % 100).padStart(2, "0");
    arr.push(`${y1}-${y2Short}`);
  }
  return arr;
})();

const emptyRequirementForm: RequirementRowFormState = {
  school_name: "",
  supplier_name: "",
  publisher_name: "",
  book_title: "",
  class_name: "",
  academic_session: DEFAULT_SESSION,
  required_copies: "",
  status: "confirmed",
  is_locked: false,
};

type SchoolsListResponse = School[] | { data: School[]; meta?: any };
type BooksListResponse = Book[] | { data: Book[]; meta?: any };
type ClassesListResponse = ClassItem[] | { data: ClassItem[]; meta?: any };
type SuppliersListResponse = Supplier[] | { data: Supplier[]; meta?: any };
type RequirementsListResponse = Requirement[] | { data: Requirement[]; meta?: any };

const normalizeSchools = (payload: SchoolsListResponse): School[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};
const normalizeBooks = (payload: BooksListResponse): Book[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};
const normalizeClasses = (payload: ClassesListResponse): ClassItem[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};
const normalizeSuppliers = (payload: SuppliersListResponse): Supplier[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};
const normalizeRequirements = (
  payload: RequirementsListResponse
): Requirement[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

// ✅ stronger: handles {data:{supplier:{}}} etc.
const normalizeCreatedEntity = <T extends { id: number; name?: string }>(
  payload: any
): T => {
  if (!payload) return payload as T;

  if (payload?.id != null) return payload as T;
  if (payload?.data?.id != null) return payload.data as T;
  if (Array.isArray(payload?.data) && payload.data[0]?.id != null)
    return payload.data[0] as T;

  const nested =
    payload?.supplier ||
    payload?.publisher ||
    payload?.school ||
    payload?.book ||
    payload?.data?.supplier ||
    payload?.data?.publisher ||
    payload?.data?.school ||
    payload?.data?.book ||
    payload?.data?.item ||
    payload?.item;

  if (nested?.id != null) return nested as T;

  return payload as T;
};

const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "-";
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  if (Number.isNaN(n)) return String(value);
  return String(n);
};

type ToastState = { message: string; type: "success" | "error" } | null;

/* ---------- Component ---------- */

const RequirementsPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [form, setForm] = useState<RequirementRowFormState>(
    emptyRequirementForm
  );
  const [editingId, setEditingId] = useState<number | null>(null);

  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterSchoolId, setFilterSchoolId] = useState<string>("");
  const [filterSession, setFilterSession] = useState<string>("");

  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  // track if supplier manually changed
  const [supplierTouched, setSupplierTouched] = useState(false);

  /* ------------ tiny helpers ------------ */

  // ✅ safe compare (prevents trim on undefined)
  const ciEq = (a?: string | null, b?: string | null) =>
    String(a ?? "").trim().toLowerCase() ===
    String(b ?? "").trim().toLowerCase();

  const promptAddName = async (title: string, placeholder: string) => {
    const res = await Swal.fire({
      title,
      input: "text",
      inputPlaceholder: placeholder,
      showCancelButton: true,
      confirmButtonText: "Add",
      cancelButtonText: "Cancel",
      inputValidator: (value) => {
        const v = String(value ?? "").trim();
        if (!v) return "Please enter a name";
        return null;
      },
    });
    if (!res.isConfirmed) return null;
    return String(res.value ?? "").trim();
  };

  // ✅ Supplier popup with Phone + Email + Address
  const promptAddSupplier = async (): Promise<
    { name: string; phone?: string; email?: string; address?: string } | null
  > => {
    const res = await Swal.fire({
      title: "Add Supplier",
      html: `
        <input id="swal-sup-name" class="swal2-input" placeholder="Supplier name">
        <input id="swal-sup-phone" class="swal2-input" placeholder="Phone (optional)">
        <input id="swal-sup-email" class="swal2-input" placeholder="Email (optional)">
        <input id="swal-sup-address" class="swal2-input" placeholder="Address (optional)">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Add",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const name = (
          document.getElementById("swal-sup-name") as HTMLInputElement
        )?.value?.trim();
        const phone = (
          document.getElementById("swal-sup-phone") as HTMLInputElement
        )?.value?.trim();
        const email = (
          document.getElementById("swal-sup-email") as HTMLInputElement
        )?.value?.trim();
        const address = (
          document.getElementById("swal-sup-address") as HTMLInputElement
        )?.value?.trim();

        if (!name) {
          Swal.showValidationMessage("Please enter supplier name");
          return null;
        }

        return {
          name,
          phone: phone || undefined,
          email: email || undefined,
          address: address || undefined,
        };
      },
    });

    if (!res.isConfirmed) return null;
    return (res.value ?? null) as any;
  };

  // ✅ Publisher popup with Phone + Email + Address
  const promptAddPublisher = async (): Promise<
    { name: string; phone?: string; email?: string; address?: string } | null
  > => {
    const res = await Swal.fire({
      title: "Add Publisher",
      html: `
        <input id="swal-pub-name" class="swal2-input" placeholder="Publisher name">
        <input id="swal-pub-phone" class="swal2-input" placeholder="Phone (optional)">
        <input id="swal-pub-email" class="swal2-input" placeholder="Email (optional)">
        <input id="swal-pub-address" class="swal2-input" placeholder="Address (optional)">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Add",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const name = (
          document.getElementById("swal-pub-name") as HTMLInputElement
        )?.value?.trim();
        const phone = (
          document.getElementById("swal-pub-phone") as HTMLInputElement
        )?.value?.trim();
        const email = (
          document.getElementById("swal-pub-email") as HTMLInputElement
        )?.value?.trim();
        const address = (
          document.getElementById("swal-pub-address") as HTMLInputElement
        )?.value?.trim();

        if (!name) {
          Swal.showValidationMessage("Please enter publisher name");
          return null;
        }

        return {
          name,
          phone: phone || undefined,
          email: email || undefined,
          address: address || undefined,
        };
      },
    });

    if (!res.isConfirmed) return null;
    return (res.value ?? null) as any;
  };

  /* ------------ SAFE UNIQUE LISTS ------------ */

  const uniquePublishers = useMemo(() => {
    const seen = new Set<string>();
    return publishers.filter((p) => {
      const key = `${p.id ?? "new"}|${String(p.name ?? "")
        .trim()
        .toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [publishers]);

  const uniqueSuppliers = useMemo(() => {
    const seen = new Set<string>();
    return suppliers.filter((s) => {
      const key = `${s.id ?? "new"}|${String(s.name ?? "")
        .trim()
        .toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [suppliers]);

  const uniqueSchools = useMemo(() => {
    const seen = new Set<string>();
    return schools.filter((s) => {
      const key = `${s.id ?? "new"}|${String(s.name ?? "")
        .trim()
        .toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [schools]);

  // show books filtered by publisher selected
  const visibleBooks = useMemo(() => {
    const pubName = String(form.publisher_name ?? "").trim().toLowerCase();
    if (!pubName) return books;
    return books.filter(
      (b) =>
        b.publisher?.name &&
        b.publisher.name.toLowerCase().includes(pubName)
    );
  }, [books, form.publisher_name]);

  /* ------------ CREATE HELPERS ------------ */

  const createSupplierNow = async (
    input:
      | string
      | { name: string; phone?: string; email?: string; address?: string }
  ): Promise<Supplier> => {
    const obj =
      typeof input === "string"
        ? {
            name: String(input ?? "").trim(),
            phone: undefined,
            email: undefined,
            address: undefined,
          }
        : {
            name: String(input?.name ?? "").trim(),
            phone: input?.phone ? String(input.phone).trim() : undefined,
            email: input?.email ? String(input.email).trim() : undefined,
            address: input?.address ? String(input.address).trim() : undefined,
          };

    if (!obj.name) throw new Error("Supplier name is required.");

    const resSup = await api.post("/api/suppliers", {
      name: obj.name,
      phone: obj.phone || null,
      email: obj.email || null,
      address: obj.address || null,
    });

    let created: Supplier = normalizeCreatedEntity<Supplier>(resSup.data);
    created = {
      ...created,
      name: String(created?.name ?? obj.name).trim(),
      phone: (created as any)?.phone ?? obj.phone ?? null,
      email: (created as any)?.email ?? obj.email ?? null,
      address: (created as any)?.address ?? obj.address ?? null,
    };

    setSuppliers((prev) => {
      const filtered = prev.filter((s) => !ciEq(s.name, created.name));
      return [created, ...filtered];
    });

    return created;
  };

  const createPublisherNow = async (
    input:
      | string
      | { name: string; phone?: string; email?: string; address?: string }
  ): Promise<Publisher> => {
    const obj =
      typeof input === "string"
        ? {
            name: String(input ?? "").trim(),
            phone: undefined,
            email: undefined,
            address: undefined,
          }
        : {
            name: String(input?.name ?? "").trim(),
            phone: input?.phone ? String(input.phone).trim() : undefined,
            email: input?.email ? String(input.email).trim() : undefined,
            address: input?.address ? String(input.address).trim() : undefined,
          };

    if (!obj.name) throw new Error("Publisher name is required.");

    const resPub = await api.post("/api/publishers", {
      name: obj.name,
      phone: obj.phone || null,
      email: obj.email || null,
      address: obj.address || null,
    });

    let created: Publisher = normalizeCreatedEntity<Publisher>(resPub.data);
    created = {
      ...created,
      name: String(created?.name ?? obj.name).trim(),
      phone: (created as any)?.phone ?? obj.phone ?? null,
      email: (created as any)?.email ?? obj.email ?? null,
      address: (created as any)?.address ?? obj.address ?? null,
    };

    setPublishers((prev) => {
      const filtered = prev.filter((p) => !ciEq(p.name, created.name));
      return [created, ...filtered];
    });

    return created;
  };

  const createSchoolNow = async (name: string): Promise<School> => {
    const nm = String(name ?? "").trim();
    if (!nm) throw new Error("School name is required.");

    const res = await api.post("/api/schools", { name: nm });
    let created: School = normalizeCreatedEntity<School>(res.data);
    created = { ...created, name: String((created as any)?.name ?? nm).trim() };

    setSchools((prev) => {
      const filtered = prev.filter((s) => !ciEq(s.name, created.name));
      return [created, ...filtered];
    });

    return created;
  };

  const createBookNow = async (title: string): Promise<Book> => {
    const bookTitle = String(title ?? "").trim();
    if (!bookTitle) throw new Error("Book title is required.");

    const pubName = String(form.publisher_name ?? "").trim();
    if (!pubName)
      throw new Error("Please select Publisher first (required for new book).");

    const pub = publishers.find((p) => ciEq(p.name, pubName));
    if (!pub?.id)
      throw new Error("Publisher not found. Please select valid publisher.");

    const resBook = await api.post("/api/books", {
      title: bookTitle,
      publisher_id: pub.id,
      class_name: String(form.class_name ?? "").trim() || null,
      subject: null,
      medium: null,
      mrp: 0,
      selling_price: null,
      is_active: true,
    });

    const created: Book = normalizeCreatedEntity<Book>(resBook.data);

    setBooks((prev) => {
      const exists = prev.some((b) => String(b?.id) === String(created?.id));
      if (exists) return prev;
      return [created, ...prev];
    });

    return created;
  };

  /* ------------ FETCH HELPERS ------------ */

  const fetchSchools = async () => {
    try {
      const res = await api.get<SchoolsListResponse>("/api/schools", {
        params: { is_active: "true", limit: 500 },
      });
      setSchools(normalizeSchools(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get<ClassesListResponse>("/api/classes", {
        params: { is_active: "true", limit: 200 },
      });
      setClasses(normalizeClasses(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await api.get<BooksListResponse>("/api/books", {
        params: { limit: 1000 },
      });
      setBooks(normalizeBooks(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPublishers = async () => {
    try {
      const res = await api.get<Publisher[] | { data: Publisher[] }>(
        "/api/publishers"
      );
      const payload: any = res.data;
      const list: Publisher[] = Array.isArray(payload)
        ? payload
        : payload?.data ?? [];
      setPublishers(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get<SuppliersListResponse>("/api/suppliers", {
        params: { limit: 1000 },
      });
      setSuppliers(normalizeSuppliers(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRequirements = async (
    query?: string,
    schoolId?: string,
    session?: string
  ) => {
    setListLoading(true);
    try {
      const params: any = {};
      if (query && query.trim()) params.q = query.trim();
      if (schoolId && schoolId !== "all") params.schoolId = schoolId;
      if (session && session.trim())
        params.academic_session = session.trim();

      const res = await api.get<RequirementsListResponse>("/api/requirements", {
        params,
      });
      setRequirements(normalizeRequirements(res.data));
    } catch (err: any) {
      console.error(err);
      setError("Failed to load requirements.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
    fetchBooks();
    fetchClasses();
    fetchPublishers();
    fetchSuppliers();
    fetchRequirements();
  }, []);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // When school filter changes and we are NOT editing, auto-fill school in form and clear pending list
  useEffect(() => {
    if (editingId) return;
    if (!schools || !schools.length) return;

    if (filterSchoolId) {
      const s = schools.find((sch) => String(sch.id) === String(filterSchoolId));
      setForm((prev) => ({
        ...prev,
        school_name: s?.name || "",
        status: "confirmed",
      }));
      setPendingItems([]);
    } else {
      setForm((prev) => ({
        ...prev,
        school_name: "",
        status: "confirmed",
      }));
      setPendingItems([]);
    }

    setSupplierTouched(false);
  }, [filterSchoolId, schools, editingId]);

  const isSchoolLockedToFilter = !!filterSchoolId;

  /**
   * ✅ Auto-fill Supplier from Publisher by default
   * - If supplierTouched = true, don't override.
   */
  useEffect(() => {
    const pub = String(form.publisher_name ?? "").trim();
    if (!pub) return;
    if (supplierTouched) return;

    const sup = String(form.supplier_name ?? "").trim();
    if (!sup) {
      setForm((prev) => ({ ...prev, supplier_name: pub }));
    }
  }, [form.publisher_name, form.supplier_name, supplierTouched]);

  /* ------------ COMMON PREP HELPER ------------ */

  const prepareRequirementPayload = async (
    row: RequirementRowFormState
  ): Promise<{
    school_id: number;
    book_id: number;
    supplier_id: number | null;
    class_id: number | null;
    academic_session: string | null;
    required_copies: number;
    status: "draft" | "confirmed";
    remarks: null;
    is_locked: boolean;
  }> => {
    const schoolName = String(row.school_name ?? "").trim();
    const publisherName = String(row.publisher_name ?? "").trim();
    const bookTitle = String(row.book_title ?? "").trim();
    const className = String(row.class_name ?? "").trim();

    const supplierName = String(
      (row.supplier_name || row.publisher_name) ?? ""
    ).trim();

    if (!schoolName) throw new Error("School is required.");
    if (!bookTitle) throw new Error("Book title is required.");

    /* 1️⃣ School */
    let schoolId: number;
    const existingSchool = schools.find((s) => ciEq(s.name, schoolName));
    if (existingSchool) {
      schoolId = existingSchool.id;
    } else {
      const created = await createSchoolNow(schoolName);
      schoolId = created.id;
    }

    /* 2️⃣ Supplier */
    let supplierId: number | null = null;
    if (supplierName) {
      const existingSupplier = suppliers.find((s) => ciEq(s.name, supplierName));
      if (existingSupplier && existingSupplier.id > 0) {
        supplierId = existingSupplier.id;
      } else {
        const created = await createSupplierNow(supplierName);
        supplierId = created.id;
      }
    }

    /* 3️⃣ Publisher */
    let publisherId: number | null = null;
    if (publisherName) {
      const existingPublisher = publishers.find((p) => ciEq(p.name, publisherName));
      if (existingPublisher && existingPublisher.id > 0) {
        publisherId = existingPublisher.id;
      } else {
        const created = await createPublisherNow(publisherName);
        publisherId = created.id;
      }
    }

    /* 4️⃣ Class */
    let classId: number | null = null;
    if (className) {
      const existingClass = classes.find((c) => ciEq(c.class_name, className));
      if (existingClass) {
        classId = existingClass.id;
      } else {
        try {
          const resClass = await api.post("/api/classes", {
            class_name: className,
            sort_order: 0,
            is_active: true,
          });
          const newClass: ClassItem = resClass.data;
          classId = newClass.id;
          setClasses((prev) => [...prev, newClass]);
        } catch (err) {
          console.error("Failed to auto-create class:", err);
          classId = null;
        }
      }
    }

    /* 5️⃣ Book */
    let bookId: number;
    let existingBook: Book | undefined;

    if (publisherId) {
      existingBook = books.find(
        (b) =>
          b.title.toLowerCase() === bookTitle.toLowerCase() &&
          (b.publisher_id === publisherId || b.publisher?.id === publisherId)
      );
    } else {
      existingBook = books.find(
        (b) => b.title.toLowerCase() === bookTitle.toLowerCase()
      );
    }

    if (existingBook) {
      bookId = existingBook.id;
    } else {
      if (!publisherId) {
        throw new Error(
          "Publisher is required when creating a new book. Please select publisher."
        );
      }

      const resBook = await api.post("/api/books", {
        title: bookTitle,
        publisher_id: publisherId,
        class_name: className || null,
        subject: null,
        medium: null,
        mrp: 0,
        selling_price: null,
        is_active: true,
      });
      const newBook: Book = normalizeCreatedEntity<Book>(resBook.data);
      bookId = newBook.id;
      setBooks((prev) => [...prev, newBook]);
    }

    return {
      school_id: schoolId,
      book_id: bookId,
      supplier_id: supplierId,
      class_id: classId,
      academic_session: String(row.academic_session ?? "").trim() || null,
      required_copies: row.required_copies ? Number(row.required_copies) : 0,
      status: row.status || "confirmed",
      remarks: null,
      is_locked: row.is_locked,
    };
  };

  /* ------------ FORM HANDLERS ------------ */

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;

    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setSupplierTouched(false);

    setForm((prev) => ({
      ...emptyRequirementForm,
      school_name: prev.school_name,
      class_name: prev.class_name,
      academic_session: prev.academic_session || DEFAULT_SESSION,
      status: "confirmed",
    }));
    setEditingId(null);
  };

  const saveRequirement = async () => {
    setError(null);
    setLoading(true);

    try {
      const payload = await prepareRequirementPayload(form);

      if (editingId) {
        await api.put(`/api/requirements/${editingId}`, payload);
        setToast({
          message: "Requirement updated successfully.",
          type: "success",
        });
      } else {
        await api.post("/api/requirements", payload);
        setToast({ message: "Requirement added successfully.", type: "success" });
      }

      resetForm();
      await fetchRequirements(search, filterSchoolId, filterSession);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (editingId
          ? "Failed to update requirement."
          : "Failed to create requirement.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPending = () => {
    setError(null);

    if (!String(form.school_name ?? "").trim()) {
      const msg = "Please select a school at top before adding books.";
      setError(msg);
      setToast({ message: msg, type: "error" });
      return;
    }
    if (!String(form.class_name ?? "").trim()) {
      const msg = "Class is required.";
      setError(msg);
      setToast({ message: msg, type: "error" });
      return;
    }
    if (!String(form.book_title ?? "").trim()) {
      const msg = "Book title is required.";
      setError(msg);
      setToast({ message: msg, type: "error" });
      return;
    }
    if (!String(form.required_copies ?? "").trim()) {
      const msg = "Please enter required copies.";
      setError(msg);
      setToast({ message: msg, type: "error" });
      return;
    }

    const supplierFinal = String(form.supplier_name ?? "").trim()
      ? String(form.supplier_name ?? "").trim()
      : String(form.publisher_name ?? "").trim();

    const itemToAdd: RequirementRowFormState = {
      ...form,
      supplier_name: supplierFinal,
      status: form.status || "confirmed",
    };

    const newItem: PendingItem = {
      tempId: Date.now() + Math.random(),
      ...itemToAdd,
    };

    setPendingItems((prev) => [newItem, ...prev]);

    setToast({
      message: `Added: ${form.book_title} (${form.required_copies} copies)`,
      type: "success",
    });

    // after adding, allow auto-fill again for next row
    setSupplierTouched(false);

    // ✅ after add, publisher should disappear, supplier stays
    setForm((prev) => ({
      ...prev,
      book_title: "",
      publisher_name: "",
      status: "confirmed",
    }));
  };

  const handleRemovePending = (id: number) => {
    setPendingItems((prev) => prev.filter((p) => p.tempId !== id));
  };

  const handleClearPending = () => {
    setPendingItems([]);
  };

  const saveAllPending = async () => {
    if (!pendingItems.length) return;

    setError(null);
    setLoading(true);

    try {
      for (const item of pendingItems) {
        const payload = await prepareRequirementPayload({
          ...item,
          supplier_name: String(item.supplier_name ?? "").trim()
            ? item.supplier_name
            : item.publisher_name,
          status: item.status || "confirmed",
        });
        await api.post("/api/requirements", payload);
      }

      const count = pendingItems.length;
      setPendingItems([]);

      setSupplierTouched(false);

      setForm((prev) => ({
        ...prev,
        book_title: "",
        publisher_name: "",
        status: "confirmed",
      }));

      await fetchRequirements(search, filterSchoolId, filterSession);

      setToast({
        message: `Saved ${count} requirement(s) successfully.`,
        type: "success",
      });

      // refresh suppliers/publishers so created IDs come from backend
      await fetchSuppliers();
      await fetchPublishers();
      await fetchSchools();
      await fetchBooks();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        "Failed to save all requirements.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (r: Requirement) => {
    setError(null);
    setEditingId(r.id);
    setPendingItems([]);

    setSupplierTouched(true);

    setForm({
      school_name: r.school?.name || "",
      supplier_name: r.supplier?.name || "",
      publisher_name: r.book?.publisher?.name || "",
      book_title: r.book?.title || "",
      class_name: r.class?.class_name || "",
      academic_session: r.academic_session || DEFAULT_SESSION,
      required_copies:
        r.required_copies !== null && r.required_copies !== undefined
          ? String(r.required_copies)
          : "",
      status: (r.status as any) || "confirmed",
      is_locked: r.is_locked,
    });
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this requirement?"
    );
    if (!confirmDelete) return;

    setError(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/requirements/${id}`);
      if (editingId === id) {
        setEditingId(null);
        resetForm();
      }
      await fetchRequirements(search, filterSchoolId, filterSession);
      setToast({ message: "Requirement deleted successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to delete requirement.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  /* ------------ SEARCH & FILTERS ------------ */

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      fetchRequirements(value, filterSchoolId, filterSession);
    }, 400);
  };

  const handleSchoolFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterSchoolId(value);
    fetchRequirements(search, value, filterSession);
  };

  const handleSessionFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterSession(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchRequirements(search, filterSchoolId, value);
    }, 400);
  };

  /* ------------ IMPORT / EXPORT / PRINT PDF ------------ */

  const triggerImport = () => {
    setError(null);
    if (importInputRef.current) {
      importInputRef.current.value = "";
      importInputRef.current.click();
    }
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/requirements/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { created, updated, errors } = res.data || {};
      const errorCount = Array.isArray(errors) ? errors.length : 0;

      setToast({
        message: `Import: ${created ?? 0} new, ${updated ?? 0} updated, ${errorCount} error(s).`,
        type: "success",
      });

      await fetchRequirements(search, filterSchoolId, filterSession);
      await fetchSuppliers();
      await fetchPublishers();
      await fetchSchools();
      await fetchBooks();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        "Failed to import requirements. Please check the file format.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    setError(null);
    setExportLoading(true);

    try {
      const res = await api.get("/api/requirements/export", {
        responseType: "blob",
        params: {
          schoolId: filterSchoolId || undefined,
          academic_session: filterSession || undefined,
        },
      });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "school-book-requirements.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setToast({ message: "Requirements exported successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to export requirements.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setExportLoading(false);
    }
  };

  const handlePrintPdf = async () => {
    setError(null);
    setPrintLoading(true);

    try {
      const res = await api.get("/api/requirements/print-pdf", {
        responseType: "blob",
        params: {
          schoolId: filterSchoolId || undefined,
          academic_session: filterSession || undefined,
        },
      });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/pdf",
      });

      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");

      setToast({ message: "PDF generated successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to generate PDF.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setPrintLoading(false);
    }
  };

  /* ------------ UI ------------ */

  const currentSchoolName =
    filterSchoolId && schools.length
      ? schools.find((s) => String(s.id) === filterSchoolId)?.name || ""
      : "";

  const currentSupplierValue = String(
    (form.supplier_name || form.publisher_name) ?? ""
  ).trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow-lg">
        <div className="font-bold flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors text-sm"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
        <div className="font-bold flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm sm:text-base tracking-tight">
              School Book Requirements
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              School-wise & class-wise requirement entry
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800 text-xs sm:text-sm">
              {user?.name || "User"}
            </span>
            {user?.role && (
              <span className="text-[10px] rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2 py-0.5 border border-indigo-200 text-indigo-700 font-medium">
                {user.role}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 transform"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 p-4 lg:p-6 space-y-4">
        {/* Current school strip */}
        <section className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl px-4 py-2 flex items-center justify-between text-[11px] sm:text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Current school:</span>
            <span className="text-slate-900 font-medium">
              {currentSchoolName
                ? currentSchoolName
                : "Not locked. You can still select school in form below."}
            </span>
          </div>
          {currentSchoolName && (
            <span className="text-slate-500 hidden sm:block">
              Keep changing Book / Copies and click Add to List. Finally, use Save
              All on the right side.
            </span>
          )}
        </section>

        {/* Error alert */}
        {error && (
          <section>
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm text-xs sm:text-sm text-red-700 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                !
              </div>
              <span>{error}</span>
            </div>
          </section>
        )}

        {/* MAIN: FIRST FORM */}
        <section className="space-y-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-200/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm sm:text-base font-semibold text-slate-800">
                  {editingId ? "Edit Requirement" : "Add Requirements (buffer)"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select School, Class, Book, Publisher, Supplier & Copies.{" "}
                  {!editingId
                    ? "Use Add to List to add multiple books. Use Save All button on the right panel to commit them."
                    : "Save will update this row immediately."}
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-5/12 space-y-3 text-[11px] sm:text-xs">
                {/* School (dropdown + add) */}
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700">School</label>
                  <div className="flex items-center gap-2">
                    <select
                      name="school_name"
                      value={form.school_name}
                      onChange={handleChange}
                      disabled={isSchoolLockedToFilter && !editingId}
                      className={`w-full border rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        isSchoolLockedToFilter && !editingId
                          ? "bg-slate-100 text-slate-500"
                          : "border-slate-300"
                      }`}
                    >
                      <option value="">
                        {isSchoolLockedToFilter && !editingId
                          ? "Using selected school"
                          : "Select school"}
                      </option>
                      {uniqueSchools.map((s) => (
                        <option key={`sch-${s.id}`} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isSchoolLockedToFilter && !editingId}
                      className="h-9 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold disabled:opacity-50"
                      title="Add new school"
                      onClick={async () => {
                        const nm = await promptAddName("Add School", "Enter school name");
                        if (!nm) return;
                        try {
                          const created = await createSchoolNow(nm);
                          setForm((prev) => ({ ...prev, school_name: created.name }));
                          setToast({
                            message: `School added: ${created.name}`,
                            type: "success",
                          });
                          await fetchSchools();
                        } catch (e: any) {
                          const msg =
                            e?.response?.data?.error ||
                            e?.message ||
                            "Failed to add school.";
                          setToast({ message: msg, type: "error" });
                        }
                      }}
                    >
                      ➕
                    </button>
                  </div>
                </div>

                {/* Class (keep as input + datalist) */}
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700">Class</label>
                  <input
                    list="classOptions"
                    name="class_name"
                    value={form.class_name}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Type or select class"
                  />
                </div>

                {/* Publisher (dropdown + add) */}
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700">Publisher</label>
                  <div className="flex items-center gap-2">
                    <select
                      name="publisher_name"
                      value={form.publisher_name}
                      onChange={(e) => {
                        const v = String(e.target.value ?? "");
                        setForm((prev) => ({ ...prev, publisher_name: v }));
                        if (!supplierTouched && v.trim()) {
                          setForm((prev) => ({
                            ...prev,
                            publisher_name: v,
                            supplier_name: v,
                          }));
                        }
                      }}
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Select publisher</option>
                      {uniquePublishers
                        .filter((p) => String(p?.name ?? "").trim())
                        .map((p) => (
                          <option key={`pub-${p.id}`} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      className="h-9 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                      title="Add new publisher (with phone/email/address + auto supplier)"
                      onClick={async () => {
                        const pub = await promptAddPublisher();
                        if (!pub) return;

                        try {
                          // 1) Create Publisher with details
                          const createdPub = await createPublisherNow(pub);

                          // 2) Ensure same-name Supplier exists (create if missing) with SAME details
                          const existingSup = suppliers.find((s) => ciEq(s.name, createdPub.name));
                          const createdSup = existingSup
                            ? existingSup
                            : await createSupplierNow({
                                name: createdPub.name,
                                phone: createdPub.phone || undefined,
                                email: createdPub.email || undefined,
                                address: createdPub.address || undefined,
                              });

                          // 3) Select both in form
                          setForm((prev) => ({
                            ...prev,
                            publisher_name: createdPub.name,
                            supplier_name: createdSup.name,
                          }));
                          setSupplierTouched(true);

                          setToast({
                            message: `Publisher added: ${createdPub.name} (Supplier auto-created/selected)`,
                            type: "success",
                          });

                          await fetchPublishers();
                          await fetchSuppliers();
                        } catch (e: any) {
                          const msg =
                            e?.response?.data?.error ||
                            e?.message ||
                            "Failed to add publisher.";
                          setToast({ message: msg, type: "error" });
                        }
                      }}
                    >
                      ➕
                    </button>
                  </div>
                </div>

                {/* Book (dropdown + add) */}
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700">Book</label>
                  <div className="flex items-center gap-2">
                    <select
                      name="book_title"
                      value={form.book_title}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      {(() => {
                        const current = String(form.book_title ?? "").trim();
                        if (!current) return null;
                        const exists = visibleBooks.some(
                          (b) =>
                            String(b?.title ?? "").trim().toLowerCase() ===
                            current.toLowerCase()
                        );
                        if (exists) return null;
                        return <option value={current}>{current} (current)</option>;
                      })()}

                      <option value="">Select book</option>
                      {visibleBooks
                        .filter((b) => String(b?.title ?? "").trim())
                        .map((b) => (
                          <option key={`book-${b.id}`} value={b.title}>
                            {b.title}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      className="h-9 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                      title="Add new book"
                      onClick={async () => {
                        const nm = await promptAddName("Add Book", "Enter book title");
                        if (!nm) return;
                        try {
                          const created = await createBookNow(nm);
                          setForm((prev) => ({ ...prev, book_title: created.title }));
                          setToast({ message: `Book added: ${created.title}`, type: "success" });
                          await fetchBooks();
                        } catch (e: any) {
                          const msg =
                            e?.response?.data?.error ||
                            e?.message ||
                            "Failed to add book.";
                          setToast({ message: msg, type: "error" });
                        }
                      }}
                    >
                      ➕
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    For new book, Publisher must be selected.
                  </p>
                </div>

                {/* Supplier (dropdown + add) */}
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700">Supplier</label>

                  <div className="flex items-center gap-2">
                    <select
                      name="supplier_name"
                      value={currentSupplierValue || ""}
                      onChange={(e) => {
                        const v = String(e.target.value ?? "");
                        setForm((prev) => ({ ...prev, supplier_name: v }));
                        setSupplierTouched(!!v.trim());
                      }}
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      {(() => {
                        const current = String(
                          (form.supplier_name || form.publisher_name) ?? ""
                        ).trim();
                        if (!current) return null;
                        const exists = uniqueSuppliers.some((s) => ciEq(s.name, current));
                        if (exists) return null;
                        return <option value={current}>{current} (current)</option>;
                      })()}

                      <option value="">(Default = Publisher)</option>

                      {uniqueSuppliers
                        .filter((s) => String(s?.name ?? "").trim())
                        .map((s) => (
                          <option key={`sup-${s.id}`} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      className="h-9 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                      title="Add new supplier"
                      onClick={async () => {
                        const sup = await promptAddSupplier();
                        if (!sup) return;

                        try {
                          const created = await createSupplierNow(sup);

                          setForm((prev) => ({ ...prev, supplier_name: created.name }));
                          setSupplierTouched(true);

                          await fetchSuppliers();

                          setToast({
                            message: `Supplier added: ${created.name}`,
                            type: "success",
                          });
                        } catch (e: any) {
                          const msg =
                            e?.response?.data?.error ||
                            e?.message ||
                            "Failed to add supplier.";
                          setToast({ message: msg, type: "error" });
                        }
                      }}
                    >
                      ➕
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-500">
                    Default supplier = publisher. If missing, click ➕ to add.
                  </p>
                </div>

                {/* Session + Copies */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-700">Session</label>
                    <select
                      name="academic_session"
                      value={form.academic_session}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Select session</option>
                      {SESSION_OPTIONS.map((session) => (
                        <option key={session} value={session}>
                          {session}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-medium text-slate-700">Required copies</label>
                    <input
                      name="required_copies"
                      type="number"
                      min={0}
                      value={form.required_copies}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Status + Lock */}
                <div className="grid grid-cols-2 gap-3 items-center">
                  <div className="space-y-1">
                    <label className="block font-medium text-slate-700">Status</label>
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="draft">Draft</option>
                      <option value="confirmed">Confirmed</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input
                      type="checkbox"
                      name="is_locked"
                      checked={form.is_locked}
                      onChange={handleChange}
                      className="h-4 w-4"
                    />
                    <span className="text-[11px] text-slate-700">
                      Lock this row (freeze for order)
                    </span>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {editingId ? (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={saveRequirement}
                        className="inline-flex items-center justify-center flex-1 h-9 px-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                      >
                        {loading ? "Saving..." : "Save Requirement"}
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        className="inline-flex items-center justify-center h-9 px-3 rounded-full border border-slate-300 bg-white text-[11px] sm:text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleAddPending}
                        className="inline-flex items-center justify-center flex-1 h-9 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                      >
                        Add to List
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        className="inline-flex items-center justify-center h-9 px-3 rounded-full border border-slate-300 bg-white text-[11px] sm:text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                      {pendingItems.length > 0 && (
                        <span className="text-[11px] text-slate-500">
                          {pendingItems.length} book(s) in list. Use{" "}
                          <span className="font-semibold text-emerald-600">
                            Save All
                          </span>{" "}
                          on the Selected Books panel.
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Pending panel */}
              {!editingId && pendingItems.length > 0 && (
                <div className="w-full lg:w-7/12">
                  <div className="border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pl-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[11px] sm:text-xs font-semibold text-slate-700">
                          Selected Books (Pending)
                        </h4>
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                          {pendingItems.length} item{pendingItems.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={loading || pendingItems.length === 0}
                          onClick={saveAllPending}
                          className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[10px] sm:text-[11px] font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                        >
                          {loading ? "Saving..." : `Save All (${pendingItems.length})`}
                        </button>
                        <button
                          type="button"
                          disabled={loading || pendingItems.length === 0}
                          onClick={handleClearPending}
                          className="hidden sm:inline-flex items-center justify-center h-8 px-2.5 rounded-full border border-slate-300 bg-white text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          Clear List
                        </button>
                      </div>
                    </div>

                    <div className="overflow-auto max-h-60 rounded-lg border border-slate-200/80 bg-slate-50">
                      <table className="w-full text-[10px] sm:text-[11px] border-collapse">
                        <thead className="bg-slate-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-1 py-1 text-left border-b border-slate-200 min-w-[60px]">
                              Class
                            </th>
                            <th className="px-1 py-1 text-left border-b border-slate-200 min-w-[120px]">
                              Book
                            </th>
                            <th className="px-1 py-1 text-left border-b border-slate-200 min-w-[90px]">
                              Pub
                            </th>
                            <th className="px-1 py-1 text-left border-b border-slate-200 min-w-[120px]">
                              Sup
                            </th>
                            <th className="px-1 py-1 text-center border-b border-slate-200 min-w-[60px]">
                              Sess
                            </th>
                            <th className="px-1 py-1 text-right border-b border-slate-200 min-w-[50px]">
                              Copies
                            </th>
                            <th className="px-1 py-1 text-center border-b border-slate-200 min-w-[60px]">
                              Status
                            </th>
                            <th className="px-1 py-1 text-center border-b border-slate-200 min-w-[50px]">
                              Lock
                            </th>
                            <th className="px-1 py-1 text-center border-b border-slate-200 min-w-[40px]">
                              Del
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingItems.map((item) => (
                            <tr key={item.tempId} className="bg-white">
                              <td className="px-1 py-1 border-b border-slate-200 truncate">
                                {item.class_name || "-"}
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200">
                                <span className="font-semibold truncate inline-block max-w-[140px]">
                                  {item.book_title}
                                </span>
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200">
                                <span className="truncate inline-block max-w-[100px] text-slate-700">
                                  {item.publisher_name || "-"}
                                </span>
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200">
                                <span className="truncate inline-block max-w-[140px] text-slate-700">
                                  {item.supplier_name || "-"}
                                </span>
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200 text-center">
                                {item.academic_session || "-"}
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200 text-right">
                                {item.required_copies || "0"}
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200 text-center">
                                <span
                                  className={`inline-flex items-center px-1 py-0.5 rounded-full text-[8px] ${
                                    item.status === "confirmed"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-amber-50 text-amber-700 border border-amber-200"
                                  }`}
                                >
                                  {item.status === "confirmed" ? "Conf" : "Draft"}
                                </span>
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200 text-center">
                                <span
                                  className={`inline-flex items-center px-1 py-0.5 rounded-full text-[8px] ${
                                    item.is_locked
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-50 text-slate-600 border border-slate-200"
                                  }`}
                                >
                                  {item.is_locked ? "L" : "O"}
                                </span>
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePending(item.tempId)}
                                  className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow hover:shadow-md hover:scale-110 transition-all"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* class datalist only */}
            <datalist id="classOptions">
              {classes.map((c) => (
                <option key={`class-${c.id}`} value={c.class_name} />
              ))}
            </datalist>
          </div>

          {/* FILTERS + EXCEL */}
          <section className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-md px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-800">Filters & Excel</span>
                <span className="text-[11px] text-slate-500">
                  Filter requirements below or import / export Excel / print PDF.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={handleSearchChange}
                  className="px-3 py-1.5 border border-slate-300 rounded-full text-xs sm:text-sm min-w-[180px] bg-white shadow-sm"
                  placeholder="Search by school / book..."
                />

                <select
                  value={filterSchoolId}
                  onChange={handleSchoolFilterChange}
                  className="px-3 py-1.5 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[180px] shadow-sm"
                >
                  <option value="">All schools / Select school</option>
                  {schools.map((s) => (
                    <option key={`fsch-${s.id}`} value={s.id.toString()}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterSession}
                  onChange={handleSessionFilterChange}
                  className="px-3 py-1.5 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[120px] shadow-sm"
                >
                  <option value="">All sessions</option>
                  {SESSION_OPTIONS.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="file"
                accept=".xlsx,.xls"
                ref={importInputRef}
                onChange={handleImportFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={triggerImport}
                  disabled={importLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs sm:text-sm font-medium shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{importLoading ? "Importing..." : "Import Excel"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exportLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs sm:text-sm font-medium shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportLoading ? "Exporting..." : "Export Excel"}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  disabled={printLoading || !filterSchoolId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs sm:text-sm font-medium shadow-sm"
                  title={
                    filterSchoolId
                      ? "Open printable PDF in new tab"
                      : "Select a school first to print PDF"
                  }
                >
                  <Download className="w-3.5 h-3.5 rotate-90" />
                  <span>{printLoading ? "Generating..." : "Print PDF"}</span>
                </button>
              </div>
            </div>
          </section>

          {/* LISTING */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-200/60">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                Requirements ({requirements.length})
              </h2>
            </div>

            {listLoading ? (
              <div className="flex items-center justify-center py-8 text-xs sm:text-sm text-slate-600">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                Loading requirements...
              </div>
            ) : requirements.length === 0 ? (
              <div className="text-xs sm:text-sm text-slate-500 py-3 mb-2">
                No requirements yet. Select a school & use the form above to add your first record.
              </div>
            ) : null}

            <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-200/80 shadow-inner">
              <table className="w-full text-[11px] sm:text-sm border-collapse bg-white">
                <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      School
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Class
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Book
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Publisher
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Supplier
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                      Session
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Copies
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                      Lock
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="border-b border-slate-200 px-3 py-2 align-top">
                        <div className="font-semibold truncate max-w-[220px] text-slate-800">
                          {r.school?.name || "-"}
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 align-top text-slate-700">
                        {r.class?.class_name || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 align-top">
                        <div className="font-semibold truncate max-w-[260px] text-slate-800">
                          {r.book?.title || "-"}
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 align-top">
                        <div className="text-[11px] text-slate-700 truncate max-w-[160px]">
                          {r.book?.publisher?.name || "-"}
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 align-top">
                        <div className="text-[11px] text-slate-700 truncate max-w-[160px]">
                          {r.supplier?.name || "-"}
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-center align-top text-slate-700">
                        {r.academic_session || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right align-top text-slate-800">
                        {formatNumber(r.required_copies)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-center align-top">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                            r.status === "confirmed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {r.status === "confirmed" ? "Confirmed" : "Draft"}
                        </span>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-center align-top">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                            r.is_locked
                              ? "bg-slate-900 text-white"
                              : "bg-slate-50 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {r.is_locked ? "Locked" : "Open"}
                        </span>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 align-top">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(r)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all"
                            aria-label="Edit requirement"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all disabled:opacity-60"
                            aria-label="Delete requirement"
                          >
                            {deletingId === r.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm sm:text-base ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default RequirementsPageClient;
