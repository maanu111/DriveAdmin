"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useState as useToastState, useEffect as useToastEffect } from "react";
type ToastType = "success" | "error" | "warning" | "info";

import {
  Search,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  Filter,
  ChevronDown,
  Video,
} from "lucide-react";
import { ClimbingBoxLoader } from "react-spinners";
import { FastAverageColor } from "fast-average-color";
import { HotTable } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
const styles = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  .animate-slideIn {
    animation: slideIn 0.3s ease-out;
  }
`;

if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
//
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}
interface TrafficSign {
  id: string;
  name_english: string;
  name_hindi: string;
  meaning: string;
  hindi_meaning: string;
  explanation: string;
  real_life_example: string;
  color: string;
  shape: string;
  video_url: string | null;
  icon_urls: string[];

  created_at?: string;
  sort_order?: number;
}
//
// Color detection function - detects dominant color in image
// Helper function to categorize color
const categorizeColor = (r: number, g: number, b: number): string => {
  // White detection (high brightness, low color variance)
  if (r > 200 && g > 200 && b > 200) {
    return "W"; // White
  }

  // Black detection (low brightness)
  if (r < 60 && g < 60 && b < 60) {
    return "K"; // Black
  }

  // Find dominant color channel
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  // Calculate average brightness
  const brightness = (r + g + b) / 3;

  // Yellow detection (high red AND high green) - PRIORITY CHECK
  if (r > 150 && g > 150 && b < 130) {
    return "Y"; // Yellow
  }

  // Orange detection (treat as Yellow for traffic signs)
  if (r > 180 && g > 80 && g < 180 && b < 100) {
    return "Y"; // Orange → Yellow
  }

  // If difference is too small but NOT gray/white/black, check for muted colors
  if (diff < 30 && brightness > 60 && brightness < 200) {
    // Check which channel is slightly higher for muted colors
    if (g > r && g > b && g > 70) {
      return "G"; // Muted/Dark Green
    }
    if (r > g && r > b && r > 70) {
      return "R"; // Muted Red
    }
    if (b > g && b > r && b > 70) {
      return "B"; // Muted Blue
    }
  }

  // Red detection (LENIENT)
  if (r === max && r > 70) {
    if (r > g + 20 && r > b + 20) {
      return "R"; // Red
    }
  }

  // Green detection (VERY LENIENT - for dark green highway signs)
  if (g === max && g > 60) {
    if (g > r + 15 && g > b + 15) {
      return "G"; // Green (catches dark greens!)
    }
  }

  // Blue detection (LENIENT)
  if (b === max && b > 70) {
    if (b > r + 20 && b > g + 20) {
      return "B"; // Blue
    }
  }

  // If still no match and there's some color difference
  if (diff > 15) {
    // Last attempt - which channel is strongest?
    if (g > r && g > b) return "G";
    if (r > g && r > b) return "R";
    if (b > r && b > g) return "B";
  }

  // Default to Other (gray/undefined colors)
  return "O";
};

// New color detection function using fast-average-color
const getImageDominantColor = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const fac = new FastAverageColor();

        try {
          const color = await fac.getColorAsync(img);

          // Extract RGB values
          const r = color.value[0];
          const g = color.value[1];
          const b = color.value[2];

          // Determine color category
          const colorCode = categorizeColor(r, g, b);

          // Clean up
          fac.destroy();

          resolve(colorCode);
        } catch (error) {
          console.error("Error detecting color:", error);
          resolve("O"); // Default to Other on error
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

let toastId = 0;
const toastListeners: ((toast: Toast) => void)[] = [];

const showToast = (message: string, type: ToastType = "info") => {
  const toast: Toast = {
    id: toastId++,
    message,
    type,
  };
  toastListeners.forEach((listener) => listener(toast));
};

function ToastContainer() {
  const [toasts, setToasts] = useToastState<Toast[]>([]);

  useToastEffect(() => {
    const listener = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };
    toastListeners.push(listener);
    return () => {
      const index = toastListeners.indexOf(listener);
      if (index > -1) toastListeners.splice(index, 1);
    };
  }, []);

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
  };

  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${
            colors[toast.type]
          } text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-[500px] animate-slideIn`}
        >
          <span className="text-xl font-bold">{icons[toast.type]}</span>
          <span className="flex-1 text-sm">{toast.message}</span>
          <button
            onClick={() =>
              setToasts((prev) => prev.filter((t) => t.id !== toast.id))
            }
            className="text-white/80 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
//
export default function TrafficSignsPage() {
  const [signs, setSigns] = useState<TrafficSign[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSign, setEditingSign] = useState<TrafficSign | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [isMediaManagerOpen, setIsMediaManagerOpen] = useState(false);
  const [quickMediaSign, setQuickMediaSign] = useState<TrafficSign | null>(
    null
  );
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showDataPreview, setShowDataPreview] = useState(false);

  const [previewImages, setPreviewImages] = useState<
    {
      file: File;
      preview: string;
      colorCode: string;
      newName: string;
    }[]
  >([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedShapes, setSelectedShapes] = useState<string[]>([]);
  const [mediaFilter, setMediaFilter] = useState<string>("all"); // all, complete, missing-image, missing-video
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedColorFilter, setSelectedColorFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("name-asc"); // name-asc, name-desc, recent, oldest
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportType, setExportType] = useState<"csv" | "excel" | null>(null);
  const [exportData, setExportData] = useState<any[]>([]);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedSignIds, setSelectedSignIds] = useState<string[]>([]);
  const [showBulkImageAssign, setShowBulkImageAssign] = useState(false);
  const [deletedSigns, setDeletedSigns] = useState<TrafficSign[]>([]);
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [showExcelEditor, setShowExcelEditor] = useState(false);
  useEffect(() => {
    fetchSigns();
  }, []);
  //
  useEffect(() => {
    // Cleanup preview URLs on unmount
    return () => {
      previewImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, [previewImages]);
  //
  useEffect(() => {
    fetchSigns();
    fetchDeletedSigns(); // ✅ Fetch on initial load
  }, []);
  //

  const fetchSigns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("traffic_signs")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching signs:", error);
    } else {
      setSigns(
        (data || []).map((sign) => ({
          ...sign,
          icon_urls: sign.icon_urls?.length
            ? sign.icon_urls
            : sign.icon_url
            ? [sign.icon_url]
            : [],
        }))
      );
    }
    setLoading(false);
  };
  //
  const fetchDeletedSigns = async () => {
    const { data, error } = await supabase
      .from("deleted_signs")
      .select("*")
      .order("deleted_at", { ascending: false });

    if (!error) {
      setDeletedSigns(data || []);
    }
  };
  //
  const prepareExportData = () => {
    return signs.map((sign) => ({
      Sign_No: sign.id,
      English_Meaning: sign.name_english,
      Hindi_Meaning: sign.name_hindi,
      English_Explanation: sign.explanation,
      Hindi_Explanation: sign.real_life_example,
      Sign_Color: sign.color,
      Shape: sign.shape,
      Video_URL: sign.video_url || "",
      Icon_URLs: sign.icon_urls.join(", "),
      Icon_File_Names: sign.icon_urls.map((u) => u.split("/").pop()).join(", "),

      Sort_Order: sign.sort_order ?? "",
      Created_At: sign.created_at ?? "",
    }));
  };

  //
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const signsToInsert = results.data
            .filter((row: any) => row.Sign_No) // ✅ ignore empty rows
            .map((row: any, index: number) => ({
              id: String(row.Sign_No).trim(), // ✅ clean ID
              name_english: row.English_Meaning,
              name_hindi: row.Hindi_Meaning,
              meaning: row.English_Meaning,
              hindi_meaning: row.Hindi_Meaning,
              explanation: row.English_Explanation,
              real_life_example: row.Hindi_Explanation,
              color: String(row.Sign_Color).trim(),
              shape: "",
              video_url: null,
              icon_urls: [],

              sort_order: index + 1,
            }));
          setPreviewData(signsToInsert);
          setShowDataPreview(true);
        } catch (err: any) {
          showToast("CSV parse error: " + err.message, "error");
        }
      },
    });
  };
  //
  const handleCSVExportClick = () => {
    setExportType("csv");
    setExportData(prepareExportData());
    setShowExportPreview(true);
  };

  const handleExcelExportClick = () => {
    setExportType("excel");
    setExportData(prepareExportData());
    setShowExportPreview(true);
  };
  //
  const exportCSV = (data: any[]) => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traffic_signs.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  //
  const exportExcel = (data: any[]) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Traffic Signs");

    XLSX.writeFile(workbook, "traffic_signs.xlsx");
  };

  //
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const signsToInsert = jsonData
          .filter((row: any) => row.Sign_No) // ✅ ignore empty rows
          .map((row: any, index: number) => ({
            id: String(row.Sign_No).trim(), // ✅ clean ID
            name_english: row.English_Meaning,
            name_hindi: row.Hindi_Meaning,
            meaning: row.English_Meaning,
            hindi_meaning: row.Hindi_Meaning,
            explanation: row.English_Explanation,
            real_life_example: row.Hindi_Explanation,
            color: String(row.Sign_Color).trim(),
            shape: "",
            video_url: null,
            icon_urls: [],
            sort_order: index + 1,
          }));
        setPreviewData(signsToInsert);
        setShowDataPreview(true);
      } catch (error: any) {
        showToast("Error parsing Excel: " + error.message, "error");
      }
    };
    reader.readAsBinaryString(file);
  };
  //
  const handleBulkImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);

    // Color counters
    const colorCounters: { [key: string]: number } = {
      Y: 1, // Yellow
      G: 1, // Green
      R: 1, // Red
      B: 1, // Blue
      W: 1, // White
      K: 1, // Black
      O: 1, // Other
    };

    const previews: {
      file: File;
      preview: string;
      colorCode: string;
      newName: string;
    }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Check if it's an image
        if (!file.type.startsWith("image/")) {
          console.log(`Skipped ${file.name}: Not an image`);
          continue;
        }

        // Detect dominant color
        const colorCode = await getImageDominantColor(file);

        // Generate new name
        const counter = colorCounters[colorCode].toString().padStart(3, "0");
        const fileExt = file.name.split(".").pop();
        const newName = `${colorCode}${counter}.${fileExt}`;

        // Create preview URL
        const previewUrl = URL.createObjectURL(file);

        previews.push({
          file,
          preview: previewUrl,
          colorCode,
          newName,
        });

        colorCounters[colorCode]++;
        console.log(
          `✅ Processed ${i + 1}/${files.length}: ${file.name} → ${newName}`
        );
      }

      setPreviewImages(previews);
      setShowPreview(true);
      setLoading(false);
    } catch (error: any) {
      showToast("Error processing images: " + error.message, "error");
      setLoading(false);
    }

    // Reset input
    e.target.value = "";
  };
  //
  const handleConfirmUpload = async () => {
    setShowPreview(false);
    setLoading(true);

    let successCount = 0;
    const uploadedFiles: {
      original: string;
      renamed: string;
      color: string;
    }[] = [];

    try {
      for (let i = 0; i < previewImages.length; i++) {
        const { file, newName, colorCode } = previewImages[i];

        // Upload to storage with new name
        const filePath = `library/${newName}`;

        const { error } = await supabase.storage
          .from("sign-icons")
          .upload(filePath, file, { upsert: true });

        if (error) {
          console.error(`Error uploading ${file.name}:`, error);
        } else {
          uploadedFiles.push({
            original: file.name,
            renamed: newName,
            color: colorCode,
          });
          successCount++;
          console.log(
            `✅ Uploaded ${i + 1}/${previewImages.length}: ${newName}`
          );
        }
      }

      // Cleanup preview URLs
      previewImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setPreviewImages([]);

      // Show summary
      console.table(uploadedFiles);
      showToast(
        `Successfully uploaded ${successCount} images to library!`,
        "success"
      );
      setLoading(false);
    } catch (error: any) {
      showToast("Error during upload: " + error.message, "error");
      setLoading(false);
    }
  };
  //
  const handleConfirmDataUpload = async () => {
    const { error } = await supabase.from("traffic_signs").insert(previewData);
    if (error) {
      showToast("Upload failed: " + error.message, "error");
      return;
    }

    showToast(`Successfully imported ${previewData.length} signs`, "success");
    setShowDataPreview(false);
    setPreviewData([]);
    fetchSigns();
  };

  //
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this sign?")) return;

    // 1. Get the sign data first
    const { data: signData, error: fetchError } = await supabase
      .from("traffic_signs")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !signData) {
      showToast("Error fetching sign data", "error");
      return;
    }

    // 2. Insert into deleted_signs
    const { error: insertError } = await supabase
      .from("deleted_signs")
      .insert(signData);

    if (insertError) {
      showToast("Error moving to deleted: " + insertError.message, "error");
      return;
    }

    // 3. Delete from traffic_signs
    const { error: deleteError } = await supabase
      .from("traffic_signs")
      .delete()
      .eq("id", id);

    if (deleteError) {
      showToast("Error deleting sign: " + deleteError.message, "error");
    } else {
      showToast("Sign moved to deleted (can be restored)", "success");
      fetchSigns();
      fetchDeletedSigns(); // ✅ Update count after delete
    }
  };
  //
  const handleRestore = async (sign: TrafficSign) => {
    if (!confirm("Restore this sign?")) return;

    // Remove deleted_at before restoring
    const { deleted_at, ...signData } = sign as any;

    // 1. Insert back to traffic_signs
    const { error: insertError } = await supabase
      .from("traffic_signs")
      .insert(signData);

    if (insertError) {
      showToast("Error restoring: " + insertError.message, "error");
      return;
    }

    // 2. Delete from deleted_signs
    const { error: deleteError } = await supabase
      .from("deleted_signs")
      .delete()
      .eq("id", sign.id);

    if (deleteError) {
      showToast("Error removing from deleted", "error");
    } else {
      showToast("Sign restored successfully!", "success");
      fetchSigns();
      fetchDeletedSigns();
    }
  };
  //

  const handleEdit = (sign: TrafficSign) => {
    setEditingSign(sign);
    setIsFormOpen(true);
  };
  //
  const handleQuickMedia = (sign: TrafficSign) => {
    setQuickMediaSign(sign);
  };
  //
  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingSign(null);
    fetchSigns();
  };

  const filteredSigns = signs.filter((sign) => {
    // Text search
    const matchesSearch =
      sign.name_english.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sign.name_hindi.includes(searchTerm) ||
      sign.meaning.toLowerCase().includes(searchTerm.toLowerCase());

    // Color filter
    const matchesColor =
      selectedColors.length === 0 ||
      selectedColors.some(
        (c) => c.toLowerCase().trim() === sign.color.toLowerCase().trim()
      );

    // Media status filter
    let matchesMedia = true;
    if (mediaFilter === "complete") {
      matchesMedia = sign.icon_urls.length > 0 && !!sign.video_url;
    } else if (mediaFilter === "missing-image") {
      matchesMedia = sign.icon_urls.length === 0;
    } else if (mediaFilter === "missing-video") {
      matchesMedia = !sign.video_url; // This one is fine
    } else if (mediaFilter === "incomplete") {
      matchesMedia = sign.icon_urls.length === 0 || !sign.video_url;
    }

    return matchesSearch && matchesColor && matchesMedia;
  });

  const totalPages = Math.ceil(filteredSigns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSigns = filteredSigns.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      // Redirect to login
      window.location.href = "/auth/login";
    }
  };
  return (
    <>
      <ToastContainer />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-2">
          {/* IMPROVED MODERN HEADER */}
          <div className="mb-6">
            {/* Main Card Container */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Top Section: Title + Primary Action */}
              <div className="p-4 sm:p-6 border-b border-gray-100">
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Title with Icon */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12  rounded-xl flex items-center justify-center shadow-md">
                      <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-black" />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                        Traffic Signs
                      </h1>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                        {filteredSigns.length} total •{" "}
                        {signs.filter((s) => !s.icon_urls.length).length}{" "}
                        without images
                      </p>
                    </div>
                  </div>

                  {/* Right: Primary Action */}
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">New Sign</span>
                    <span className="sm:hidden">New</span>
                  </button>
                </div>
              </div>

              {/* Middle Section: Search Bar */}
              <div className="p-4 sm:px-6 sm:py-4 bg-gray-50/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, meaning, or color..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Section: Action Buttons */}
              <div className="p-4 sm:px-6 sm:py-4 bg-gradient-to-r from-gray-50 to-gray-100/50">
                <div className="flex flex-wrap gap-2">
                  {/* Import Group */}
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-blue-500 hover:bg-blue-50 rounded-lg text-xs font-medium cursor-pointer transition-all group">
                      <Upload className="w-3.5 h-3.5 text-gray-600 group-hover:text-blue-600" />
                      <span className="text-gray-700 group-hover:text-blue-700">
                        CSV
                      </span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUpload}
                        className="hidden"
                      />
                    </label>

                    <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-green-500 hover:bg-green-50 rounded-lg text-xs font-medium cursor-pointer transition-all group">
                      <Upload className="w-3.5 h-3.5 text-gray-600 group-hover:text-green-600" />
                      <span className="text-gray-700 group-hover:text-green-700">
                        Excel
                      </span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Divider */}
                  <div className="hidden sm:block w-px h-8 bg-gray-300"></div>

                  {/* Export Group */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCSVExportClick}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-purple-500 hover:bg-purple-50 rounded-lg text-xs font-medium transition-all group"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-gray-600 group-hover:text-purple-600" />
                      <span className="text-gray-700 group-hover:text-purple-700">
                        Export CSV
                      </span>
                    </button>

                    <button
                      onClick={handleExcelExportClick}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-purple-500 hover:bg-purple-50 rounded-lg text-xs font-medium transition-all group"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-gray-600 group-hover:text-purple-600" />
                      <span className="text-gray-700 group-hover:text-purple-700">
                        Export Excel
                      </span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="hidden sm:block w-px h-8 bg-gray-300"></div>

                  {/* Utility Actions */}
                  <div className="flex gap-2 ml-auto">
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-orange-500 hover:bg-orange-50 rounded-lg text-xs font-medium cursor-pointer transition-all group">
                      <ImageIcon className="w-3.5 h-3.5 text-gray-600 group-hover:text-orange-600" />
                      <span className="hidden sm:inline text-gray-700 group-hover:text-orange-700">
                        Bulk Upload
                      </span>
                      <span className="sm:hidden text-gray-700 group-hover:text-orange-700">
                        Bulk
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleBulkImageUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setShowExcelEditor(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-green-500 hover:bg-green-50 rounded-lg text-xs font-medium transition-all group"
                    >
                      <Edit className="w-3.5 h-3.5 text-gray-600 group-hover:text-green-600" />
                      <span className="text-gray-700 group-hover:text-green-700">
                        Excel Edit
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        fetchDeletedSigns();
                        setShowDeletedModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:border-red-500 hover:bg-red-50 rounded-lg text-xs font-medium transition-all group"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-600 group-hover:text-red-600" />
                      <span className="text-gray-700 group-hover:text-red-700">
                        <span className="hidden sm:inline">Deleted </span>(
                        {deletedSigns.length})
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signs Grid */}
          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <ClimbingBoxLoader
                  color="#6366f1"
                  loading={loading}
                  size={15}
                />
              </div>
            </div>
          ) : currentSigns.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 mb-2">No signs found</p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {currentSigns.map((sign) => (
                  <div
                    key={sign.id}
                    className="bg-white rounded-lg border border-gray-200 hover:shadow-lg hover:border-blue-300 transition-all duration-200 overflow-hidden group"
                  >
                    {/* Image */}
                    <div className="h-24 bg-gray-50 flex items-center justify-center relative">
                      {sign.icon_urls.length ? (
                        sign.icon_urls.length === 1 ? (
                          <img
                            src={sign.icon_urls[0]}
                            alt={sign.name_english}
                            className="w-full h-full object-contain p-2"
                          />
                        ) : (
                          <div
                            className={`grid ${
                              sign.icon_urls.length === 2
                                ? "grid-cols-2"
                                : "grid-cols-2 grid-rows-2"
                            } gap-0.5 w-full h-full`}
                          >
                            {sign.icon_urls.slice(0, 4).map((url, i) => (
                              <div key={i} className="relative bg-white">
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-full object-contain p-0.5"
                                />
                                {i === 3 && sign.icon_urls.length > 4 && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-bold">
                                    +{sign.icon_urls.length - 4}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon className="w-12 h-12 text-gray-300" />
                          <span className="text-xs text-gray-400">
                            No image
                          </span>
                        </div>
                      )}
                      {sign.video_url && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                          <Video className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-3">
                      <h3 className="text-xs font-semibold text-gray-900 mb-0.5 truncate">
                        {sign.name_english}
                      </h3>
                      <p className="text-[11px] text-gray-500 mb-2 truncate">
                        {sign.name_hindi}
                      </p>

                      {/* Actions */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleQuickMedia(sign)}
                          className="w-full flex items-center justify-center gap-1 py-1.5 sm:py-2 px-2 sm:px-3 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 rounded-lg font-medium transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          Media
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(sign)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 sm:py-2 px-2 sm:px-3 text-xs bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-600 rounded-lg font-medium transition-colors"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(sign.id)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 sm:py-2 px-2 sm:px-3 text-xs bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg font-medium transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                  <p className="text-xs sm:text-sm text-gray-600">
                    Showing {startIndex + 1}-
                    {Math.min(endIndex, filteredSigns.length)} of{" "}
                    {filteredSigns.length}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Previous</span>
                      <span className="sm:hidden">Prev</span>
                    </button>

                    <div className="flex gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => {
                          if (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          ) {
                            return (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  currentPage === page
                                    ? "bg-blue-600 text-white"
                                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                {page}
                              </button>
                            );
                          } else if (
                            page === currentPage - 2 ||
                            page === currentPage + 2
                          ) {
                            return (
                              <span
                                key={page}
                                className="px-2 py-2 text-gray-400"
                              >
                                ...
                              </span>
                            );
                          }
                          return null;
                        }
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {isFormOpen && (
          <SignForm sign={editingSign} onClose={handleFormClose} />
        )}
        {isMediaManagerOpen && (
          <MediaManager
            onClose={() => {
              setIsMediaManagerOpen(false);
              fetchSigns();
            }}
          />
        )}
        {quickMediaSign && (
          <QuickMediaUpload
            sign={quickMediaSign}
            onClose={() => {
              setQuickMediaSign(null);
              fetchSigns();
            }}
          />
        )}
        {showPreview && (
          <ImagePreviewModal
            images={previewImages}
            onConfirm={handleConfirmUpload}
            onCancel={() => {
              setShowPreview(false);
              previewImages.forEach((img) => URL.revokeObjectURL(img.preview));
              setPreviewImages([]);
            }}
          />
        )}
        {showDataPreview && (
          <DataPreviewModal
            data={previewData}
            onConfirm={handleConfirmDataUpload}
            onCancel={() => {
              setShowDataPreview(false);
              setPreviewData([]);
            }}
          />
        )}
        {showExportPreview && exportType && (
          <ExportPreviewModal
            type={exportType}
            data={exportData}
            onCancel={() => {
              setShowExportPreview(false);
              setExportType(null);
              setExportData([]);
            }}
            onConfirm={() => {
              if (exportType === "csv") {
                exportCSV(exportData);
              }
              if (exportType === "excel") {
                exportExcel(exportData);
              }

              setShowExportPreview(false);
              setExportType(null);
              setExportData([]);
            }}
          />
        )}
        {showDeletedModal && (
          <DeletedSignsModal
            signs={deletedSigns}
            onRestore={handleRestore}
            onClose={() => setShowDeletedModal(false)}
          />
        )}
        {showExcelEditor && (
          <ExcelEditorModal
            signs={signs}
            onSave={() => {
              fetchSigns();
            }}
            onClose={() => setShowExcelEditor(false)}
          />
        )}
      </div>
    </>
  );
}
function SignForm({
  sign,
  onClose,
}: {
  sign: TrafficSign | null;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    id: sign?.id || "",
    name_english: sign?.name_english || "",
    name_hindi: sign?.name_hindi || "",
    meaning: sign?.meaning || "",
    hindi_meaning: sign?.hindi_meaning || "",
    explanation: sign?.explanation || "",
    real_life_example: sign?.real_life_example || "",
    color: sign?.color || "",
    shape: sign?.shape || "",
    video_url: sign?.video_url || "",
    icon_urls: sign?.icon_urls || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string[]>(
    sign?.icon_urls || []
  );
  // ✅ ADD checkDuplicate HERE
  const checkDuplicate = (newUrl: string) => {
    if (formData.icon_urls.includes(newUrl)) {
      alert("⚠️ This image is already added!");
      return true;
    }
    return false;
  };
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [libraryImages, setLibraryImages] = useState<string[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file", "warning");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size should be less than 5MB", "warning");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("sign-icons")
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("sign-icons")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      if (checkDuplicate(publicUrl)) {
        setUploading(false);
        return;
      }

      setFormData({
        ...formData,
        icon_urls: [...formData.icon_urls, publicUrl],
      });
      setImagePreview([...imagePreview, publicUrl]);
    } catch (error: any) {
      console.error("Error uploading image:", error);
      showToast("Error uploading image: " + error.message, "error");
    } finally {
      setUploading(false);
    }
  };
  //
  const fetchLibraryImages = async () => {
    setLoadingLibrary(true);
    try {
      const { data, error } = await supabase.storage
        .from("sign-icons")
        .list("library", {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) throw error;

      if (data) {
        const imageUrls = data
          .filter((file) => file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))
          .map((file) => {
            const { data: urlData } = supabase.storage
              .from("sign-icons")
              .getPublicUrl(`library/${file.name}`);
            return urlData.publicUrl;
          });

        setLibraryImages(imageUrls);
      }
    } catch (error: any) {
      console.error("Error fetching library images:", error);
      showToast("Error loading image library: " + error.message, "error");
    } finally {
      setLoadingLibrary(false);
    }
  };
  //

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (sign) {
      const { error } = await supabase
        .from("traffic_signs")
        .update(formData)
        .eq("id", sign.id);

      if (error) {
        showToast("Error updating sign: " + error.message, "error");
      } else {
        showToast("Sign updated successfully!", "success");
        onClose();
      }
    } else {
      const { error } = await supabase.from("traffic_signs").insert([formData]);

      if (error) {
        showToast("Error creating sign: " + error.message, "error");
      } else {
        showToast("Sign created successfully!", "success");
        onClose();
      }
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold text-gray-900">
            {sign ? "Edit Sign" : "New Sign"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!!sign}
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              placeholder="unique-sign-id"
            />
          </div>

          {/* Image Upload */}
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sign Images <span className="text-gray-400">(optional)</span>
            </label>

            {/* Upload Buttons */}
            <div className="flex items-start gap-4">
              <label className="flex-1 cursor-pointer">
                <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {uploading ? "Uploading..." : "Upload new"}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setShowImageLibrary(true);
                  fetchLibraryImages();
                }}
                className="flex-1"
              >
                <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors">
                  <ImageIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Choose from library
                  </span>
                </div>
              </button>
            </div>

            {imagePreview.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {imagePreview.map((url, index) => (
                  <div
                    key={index}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("imageIndex", index.toString())
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIndex = parseInt(
                        e.dataTransfer.getData("imageIndex")
                      );
                      const toIndex = index;

                      const newUrls = [...formData.icon_urls];
                      const [movedUrl] = newUrls.splice(fromIndex, 1);
                      newUrls.splice(toIndex, 0, movedUrl);

                      setFormData({ ...formData, icon_urls: newUrls });
                      setImagePreview(newUrls);
                    }}
                    className="relative group cursor-move"
                  >
                    <div className="w-full h-24 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-full object-contain p-2"
                      />
                    </div>

                    {/* Delete Button - UPDATED WITH CONFIRMATION */}
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation(); // Prevent drag interference

                        // Confirm deletion
                        if (
                          !confirm(
                            `Delete this image? (${index + 1} of ${
                              imagePreview.length
                            })`
                          )
                        ) {
                          return;
                        }

                        const newUrls = formData.icon_urls.filter(
                          (_, i) => i !== index
                        );

                        // If editing existing sign, update database immediately
                        if (sign) {
                          try {
                            const { error } = await supabase
                              .from("traffic_signs")
                              .update({ icon_urls: newUrls })
                              .eq("id", sign.id);

                            if (error) throw error;

                            // Show success message
                            showToast("Image deleted successfully!", "success");
                          } catch (error: any) {
                            showToast(
                              "Error deleting image: " + error.message,
                              "error"
                            );
                            return; // Don't update UI if database update failed
                          }
                        }

                        // Update local state
                        setFormData({ ...formData, icon_urls: newUrls });
                        setImagePreview(newUrls);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Primary Badge */}
                    {index === 0 && (
                      <span className="absolute bottom-1 left-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded shadow">
                        Primary
                      </span>
                    )}

                    {/* Image counter badge */}
                    <span className="absolute top-1 left-1 px-2 py-0.5 bg-gray-900/80 text-white text-xs rounded">
                      {index + 1}/{imagePreview.length}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              PNG, JPG or GIF (max 5MB). Drag to reorder, first image is
              primary.
            </p>
          </div>

          {/* Names */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                English Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name_english}
                onChange={(e) =>
                  setFormData({ ...formData, name_english: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Stop Sign"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hindi Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name_hindi}
                onChange={(e) =>
                  setFormData({ ...formData, name_hindi: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="रुकें"
              />
            </div>
          </div>

          {/* Meanings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meaning <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={formData.meaning}
                onChange={(e) =>
                  setFormData({ ...formData, meaning: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                placeholder="What this sign means..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hindi Meaning <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={formData.hindi_meaning}
                onChange={(e) =>
                  setFormData({ ...formData, hindi_meaning: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                placeholder="इस चिन्ह का अर्थ..."
              />
            </div>
          </div>

          {/* Explanation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explanation <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={formData.explanation}
              onChange={(e) =>
                setFormData({ ...formData, explanation: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="Detailed explanation of the sign..."
            />
          </div>

          {/* Real Life Example */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Real Life Example <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={formData.real_life_example}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  real_life_example: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="Example of where you'd see this sign..."
            />
          </div>
          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.color}
              onChange={(e) =>
                setFormData({ ...formData, color: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Red & White, Yellow & Black, etc."
            />
          </div>

          {/* Video URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Video className="w-4 h-4 text-gray-500" />
              Video URL
            </label>
            <input
              type="url"
              value={formData.video_url}
              onChange={(e) =>
                setFormData({ ...formData, video_url: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : sign ? "Update Sign" : "Create Sign"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-6 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
        {showImageLibrary && (
          <ImageLibraryModal
            images={libraryImages}
            loading={loadingLibrary}
            currentImages={formData.icon_urls} // ✅ Pass current images
            onSelect={(imageUrl) => {
              // ✅ Check for duplicates
              if (formData.icon_urls.includes(imageUrl)) {
                showToast(
                  "This image is already added to this sign!",
                  "warning"
                );
                setShowImageLibrary(false);
                return;
              }

              setFormData({
                ...formData,
                icon_urls: [...formData.icon_urls, imageUrl],
              });
              setImagePreview([...imagePreview, imageUrl]);

              setShowImageLibrary(false);
            }}
            onClose={() => setShowImageLibrary(false)}
          />
        )}
      </div>
    </div>
  );
}
//
function ImageLibraryModal({
  images,
  loading,
  currentImages = [],
  onSelect,
  onClose,
}: {
  images: string[];
  loading: boolean;
  currentImages?: string[];
  onSelect: (imageUrl: string) => void;
  onClose: () => void;
}) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedColorFilter, setSelectedColorFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("name-asc");

  // Filter and sort images
  const filteredAndSortedImages = images
    .filter((imageUrl) => {
      const filename = imageUrl.split("/").pop() || "";

      // Search filter
      const matchesSearch = filename
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      // Color filter
      const matchesColor =
        selectedColorFilter === "ALL" ||
        filename.startsWith(selectedColorFilter);

      return matchesSearch && matchesColor;
    })
    .sort((a, b) => {
      const filenameA = a.split("/").pop() || "";
      const filenameB = b.split("/").pop() || "";

      if (sortBy === "name-asc") return filenameA.localeCompare(filenameB);
      if (sortBy === "name-desc") return filenameB.localeCompare(filenameA);
      return 0;
    });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-60">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Image Library
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select an image from your uploaded library
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 border-b border-gray-200 space-y-3">
          {/* Search + Sort */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by filename..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
          </div>

          {/* Color Filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedColorFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedColorFilter === "ALL"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {["Y", "G", "R", "B", "W", "K", "O"].map((color) => {
              const labels: { [key: string]: { name: string; bg: string } } = {
                Y: { name: "Yellow", bg: "bg-yellow-100 text-yellow-800" },
                G: { name: "Green", bg: "bg-green-100 text-green-800" },
                R: { name: "Red", bg: "bg-red-100 text-red-800" },
                B: { name: "Blue", bg: "bg-blue-100 text-blue-800" },
                W: { name: "White", bg: "bg-gray-100 text-gray-800" },
                K: { name: "Black", bg: "bg-gray-800 text-white" },
                O: { name: "Other", bg: "bg-purple-100 text-purple-800" },
              };

              return (
                <button
                  key={color}
                  onClick={() => setSelectedColorFilter(color)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedColorFilter === color
                      ? `${labels[color].bg} ring-2 ring-offset-1`
                      : `${labels[color].bg} opacity-60 hover:opacity-100`
                  }`}
                >
                  {labels[color].name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <ClimbingBoxLoader color="#6366f1" loading={loading} size={15} />
            </div>
          ) : filteredAndSortedImages.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-2">No images match your filters</p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedColorFilter("ALL");
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredAndSortedImages.map((imageUrl, index) => {
                const fileName = imageUrl.split("/").pop() || "";
                const isSelected = selectedImage === imageUrl;
                const isAlreadyAdded = currentImages.includes(imageUrl); // ✅ Check if already added

                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (isAlreadyAdded) {
                        showToast(
                          "This image is already added to this sign!",
                          "warning"
                        );
                        return;
                      }
                      setSelectedImage(imageUrl);
                    }}
                    className={`relative cursor-pointer rounded-lg border-2 overflow-hidden transition-all ${
                      isAlreadyAdded
                        ? "border-gray-300 opacity-50 cursor-not-allowed" // ✅ Disabled style
                        : isSelected
                        ? "border-blue-500 ring-2 ring-blue-200 shadow-lg"
                        : "border-gray-200 hover:border-blue-300 hover:shadow-md"
                    }`}
                  >
                    {/* ✅ Add "Already Added" badge */}
                    {isAlreadyAdded && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                        <span className="bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                          Already Added
                        </span>
                      </div>
                    )}
                    <div className="aspect-square bg-gray-50 flex items-center justify-center p-3">
                      <img
                        src={imageUrl}
                        alt={fileName}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div
                      className={`p-2 ${
                        isSelected ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {fileName}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-6 h-6 text-blue-600 bg-white rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedImage) {
                onSelect(selectedImage);
              }
            }}
            disabled={!selectedImage}
            className="flex-1 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {selectedImage ? "Select Image" : "Choose an image"}
          </button>
        </div>
      </div>
    </div>
  );
}
//
function MediaManager({ onClose }: { onClose: () => void }) {
  const [signs, setSigns] = useState<TrafficSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [selectedSignId, setSelectedSignId] = useState<string | null>(null);
  const [libraryImages, setLibraryImages] = useState<string[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  useEffect(() => {
    fetchAllSigns();
  }, []);

  const fetchAllSigns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("traffic_signs")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching signs:", error);
    } else {
      setSigns(
        (data || []).map((sign) => ({
          ...sign,
          icon_urls: sign.icon_urls ?? [],
        }))
      );
    }
    setLoading(false);
  };
  const handleImageUpload = async (signId: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    setUploadingId(signId);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${signId}/${Date.now()}.${fileExt}`;

      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from("sign-icons")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("sign-icons")
        .getPublicUrl(filePath);

      const current = signs.find((s) => s.id === signId)?.icon_urls || [];

      const { error: updateError } = await supabase
        .from("traffic_signs")
        .update({
          icon_urls: [...current, urlData.publicUrl],
        })
        .eq("id", signId);

      if (updateError) throw updateError;

      fetchAllSigns();
    } catch (error: any) {
      showToast("Error uploading image: " + error.message, "error");
    } finally {
      setUploadingId(null);
    }
  };

  const handleUpdateSign = async (
    signId: string,
    field: string,
    value: string | number
  ) => {
    setSavingId(signId);

    const { error } = await supabase
      .from("traffic_signs")
      .update({ [field]: value })
      .eq("id", signId);

    if (error) {
      showToast("Error updating sign: " + error.message, "error");
    } else {
      showToast("Sign updated successfully!", "success");
      fetchAllSigns();
    }

    setSavingId(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Manage Media & Sorting
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload images and add video URLs for traffic signs
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <ClimbingBoxLoader color="#6366f1" loading={loading} size={15} />
            </div>
          ) : (
            <div className="space-y-4">
              {signs.map((sign) => (
                <div
                  key={sign.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex gap-4">
                    {/* Image Section */}
                    <div className="shrink-0">
                      <div className="w-32 h-32 bg-white rounded-lg border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                        {sign.icon_urls.length > 0 ? (
                          <img
                            src={sign.icon_urls[0]}
                            alt={sign.name_english}
                            className="w-full h-full object-contain p-2"
                          />
                        ) : (
                          <ImageIcon className="w-12 h-12 text-gray-300" />
                        )}
                      </div>
                      <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                        <Upload className="w-3 h-3" />
                        {uploadingId === sign.id ? "Uploading..." : "Upload"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(sign.id, file);
                          }}
                          disabled={uploadingId === sign.id}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Details Section */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {sign.name_english}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {sign.name_hindi}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          ID: {sign.id}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Video URL */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Video URL
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="url"
                              defaultValue={sign.video_url || ""}
                              onBlur={(e) => {
                                if (e.target.value !== sign.video_url) {
                                  handleUpdateSign(
                                    sign.id,
                                    "video_url",
                                    e.target.value
                                  );
                                }
                              }}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="https://youtube.com/watch?v=..."
                            />
                            {sign.video_url && (
                              <a
                                href={sign.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                              >
                                <Video className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Sort Order */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Sort Order
                          </label>
                          <input
                            type="number"
                            defaultValue={sign.sort_order || 0}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              if (value !== sign.sort_order) {
                                handleUpdateSign(sign.id, "sort_order", value);
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {savingId === sign.id && (
                        <p className="text-xs text-green-600">Saving...</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
function QuickMediaUpload({
  sign,
  onClose,
}: {
  sign: TrafficSign;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string[]>(sign.icon_urls);

  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [libraryImages, setLibraryImages] = useState<string[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file", "warning");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size should be less than 5MB", "warning");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${sign.id}/${Date.now()}.${fileExt}`;

      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from("sign-icons")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("sign-icons")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("traffic_signs")
        .update({
          icon_urls: [...sign.icon_urls, publicUrl],
        })

        .eq("id", sign.id);

      if (updateError) throw updateError;

      setImagePreview([...imagePreview, publicUrl]);
      showToast("Image uploaded successfully!", "success");
    } catch (error: any) {
      console.error("Error uploading image:", error);
      showToast("Error uploading image: " + error.message, "error");
    } finally {
      setUploading(false);
    }
  };
  const fetchLibraryImages = async () => {
    setLoadingLibrary(true);
    try {
      const { data, error } = await supabase.storage
        .from("sign-icons")
        .list("library", {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) throw error;

      if (data) {
        const imageUrls = data
          .filter((file) => file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))
          .map((file) => {
            const { data: urlData } = supabase.storage
              .from("sign-icons")
              .getPublicUrl(`library/${file.name}`);
            return urlData.publicUrl;
          });

        setLibraryImages(imageUrls);
      }
    } catch (error: any) {
      console.error("Error fetching library images:", error);
      showToast("Error loading image library: " + error.message, "error");
    } finally {
      setLoadingLibrary(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Upload Image
            </h2>
            <p className="text-sm text-gray-500 mt-1">{sign.name_english}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-48 h-48 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden">
              {imagePreview.length > 0 ? (
                <img
                  src={imagePreview[0]}
                  alt={sign.name_english}
                  className="w-full h-full object-contain p-4"
                />
              ) : (
                <ImageIcon className="w-16 h-16 text-gray-300" />
              )}
            </div>

            <div className="w-full flex gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Upload New"}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setShowImageLibrary(true);
                  fetchLibraryImages();
                }}
                className="flex-1"
              >
                <div className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                  <ImageIcon className="w-4 h-4" />
                  From Library
                </div>
              </button>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG or GIF (max 5MB)</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
        {showImageLibrary && (
          <ImageLibraryModal
            images={libraryImages}
            loading={loadingLibrary}
            currentImages={sign.icon_urls} // ✅ Pass current images
            onSelect={async (imageUrl) => {
              setShowImageLibrary(false);

              // ✅ Check for duplicates
              if (sign.icon_urls.includes(imageUrl)) {
                showToast(
                  "This image is already added to this sign!",
                  "warning"
                );
                return;
              }

              setUploading(true);

              try {
                const { error } = await supabase
                  .from("traffic_signs")
                  .update({
                    icon_urls: [...sign.icon_urls, imageUrl],
                  })
                  .eq("id", sign.id);

                if (error) throw error;
                setImagePreview([...imagePreview, imageUrl]);
                showToast("Image assigned successfully!", "success");
              } catch (error: any) {
                console.error("Error assigning image:", error);
                showToast("Error assigning image: " + error.message, "error");
              } finally {
                setUploading(false);
              }
            }}
            onClose={() => setShowImageLibrary(false)}
          />
        )}
      </div>
    </div>
  );
}
function ImagePreviewModal({
  images,
  onConfirm,
  onCancel,
}: {
  images: { file: File; preview: string; colorCode: string; newName: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [selectedColor, setSelectedColor] = useState<string>("ALL");

  const colorLabels: {
    [key: string]: { name: string; bg: string; border: string };
  } = {
    Y: {
      name: "Yellow",
      bg: "bg-yellow-100 text-yellow-800",
      border: "border-yellow-300",
    },
    G: {
      name: "Green",
      bg: "bg-green-100 text-green-800",
      border: "border-green-300",
    },
    R: { name: "Red", bg: "bg-red-100 text-red-800", border: "border-red-300" },
    B: {
      name: "Blue",
      bg: "bg-blue-100 text-blue-800",
      border: "border-blue-300",
    },
    W: {
      name: "White",
      bg: "bg-gray-100 text-gray-800",
      border: "border-gray-300",
    },
    K: {
      name: "Black",
      bg: "bg-gray-800 text-white",
      border: "border-gray-600",
    },
    O: {
      name: "Other",
      bg: "bg-purple-100 text-purple-800",
      border: "border-purple-300",
    },
  };

  // Group images by color
  const groupedImages = images.reduce((acc, img) => {
    if (!acc[img.colorCode]) {
      acc[img.colorCode] = [];
    }
    acc[img.colorCode].push(img);
    return acc;
  }, {} as { [key: string]: typeof images });

  // Sort color codes for consistent display
  const sortedColors = Object.keys(groupedImages).sort();

  // Filter images based on selected color
  const filteredImages =
    selectedColor === "ALL" ? images : groupedImages[selectedColor] || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Preview & Categorize Images
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {images.length} images detected and categorized by color
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Color Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedColor("ALL")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedColor === "ALL"
                  ? "bg-gray-900 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All ({images.length})
            </button>
            {sortedColors.map((code) => (
              <button
                key={code}
                onClick={() => setSelectedColor(code)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedColor === code
                    ? `${colorLabels[code].bg} shadow-md ring-2 ring-offset-1 ${colorLabels[code].border}`
                    : `${colorLabels[code].bg} opacity-60 hover:opacity-100`
                }`}
              >
                {colorLabels[code].name} ({groupedImages[code].length})
              </button>
            ))}
          </div>
        </div>

        {/* Images Grid - SMALLER CARDS */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedColor === "ALL" ? (
            // Grouped by color
            <div className="space-y-6">
              {sortedColors.map((code) => (
                <div key={code}>
                  {/* Category Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${colorLabels[code].bg}`}
                    >
                      {colorLabels[code].name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {groupedImages[code].length} images
                    </span>
                  </div>

                  {/* Images Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {groupedImages[code].map((img, index) => (
                      <ImageCard
                        key={index}
                        img={img}
                        colorLabels={colorLabels}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Single color view
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {filteredImages.map((img, index) => (
                <ImageCard key={index} img={img} colorLabels={colorLabels} />
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">
              <p className="font-medium">
                Ready to upload {images.length} images
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Images will be renamed and organized by color
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-md"
            >
              ✓ Confirm & Upload All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Separate Image Card Component for smaller, cleaner display
function ImageCard({
  img,
  colorLabels,
}: {
  img: { file: File; preview: string; colorCode: string; newName: string };
  colorLabels: { [key: string]: { name: string; bg: string; border: string } };
}) {
  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all group">
      {/* Image Preview - Square */}
      <div className="aspect-square bg-gray-50 flex items-center justify-center p-2 relative">
        <img
          src={img.preview}
          alt={img.newName}
          className="w-full h-full object-contain"
        />

        {/* Color Badge - Floating */}
        <div className="absolute top-1 right-1">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
              colorLabels[img.colorCode].bg
            }`}
          >
            {img.colorCode}
          </span>
        </div>
      </div>

      {/* New Name - Compact */}
      <div className="p-2 bg-gray-50 border-t border-gray-200">
        <p className="text-xs font-bold text-green-600 truncate text-center">
          {img.newName}
        </p>
      </div>

      {/* Hover Tooltip - Shows Original Name */}
      <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10 shadow-lg">
        {img.file.name}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
}
function DataPreviewModal({
  data,
  onConfirm,
  onCancel,
}: {
  data: any[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Preview Import Data
            </h2>
            <p className="text-sm text-gray-500">
              {data.length} rows will be imported
            </p>
          </div>
          <button onClick={onCancel}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-xs sm:text-sm border-collapse min-w-[600px]">
            {" "}
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-3 border">ID</th>
                <th className="p-3 border">English</th>
                <th className="p-3 border">Hindi</th>
                <th className="p-3 border">Color</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border">{row.id}</td>
                  <td className="p-2 border">{row.name_english}</td>
                  <td className="p-2 border">{row.name_hindi}</td>
                  <td className="p-2 border text-center">{row.color}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg"
          >
            Confirm & Upload
          </button>
        </div>
      </div>
    </div>
  );
}
function ExportPreviewModal({
  type,
  data,
  onCancel,
  onConfirm,
}: {
  type: "csv" | "excel";
  data: any[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!data.length) return null;

  const columns = Object.keys(data[0]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">
              {type === "csv" ? "Preview CSV Export" : "Preview Excel Export"}
            </h2>
            <p className="text-xs text-gray-500">{data.length} rows</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-xs border-collapse min-w-[800px]">
            <thead
              className={`sticky top-0 ${
                type === "excel" ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <tr>
                {columns.map((col) => (
                  <th key={col} className="p-2 border font-semibold text-left">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  {columns.map((col) => (
                    <td key={col} className="p-2 border">
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded text-xs"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-blue-600 text-white rounded text-xs"
          >
            Confirm & Export
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletedSignsModal({
  signs,
  onRestore,
  onClose,
}: {
  signs: TrafficSign[];
  onRestore: (sign: TrafficSign) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Recently Deleted Signs
            </h2>
            <p className="text-sm text-gray-500">
              {signs.length} deleted signs
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6">
          {signs.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No deleted signs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {signs.map((sign) => (
                <div
                  key={sign.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200 flex items-center gap-4"
                >
                  {/* Image */}
                  <div className="w-20 h-20 bg-white rounded border flex items-center justify-center">
                    {sign.icon_urls.length > 0 ? (
                      <img
                        src={sign.icon_urls[0]}
                        alt={sign.name_english}
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {sign.name_english}
                    </h3>
                    <p className="text-sm text-gray-500">{sign.name_hindi}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      ID: {sign.id} • Sort: {sign.sort_order}
                    </p>
                  </div>

                  {/* Restore Button */}
                  <button
                    onClick={() => onRestore(sign)}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
function ExcelEditorModal({
  signs,
  onSave,
  onClose,
}: {
  signs: TrafficSign[];
  onSave: (updatedSigns: any[]) => void;
  onClose: () => void;
}) {
  const hotTableRef = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const tableData = signs.map((sign) => [
    sign.id,
    sign.name_english,
    sign.name_hindi,
    sign.meaning,
    sign.hindi_meaning,
    sign.explanation,
    sign.real_life_example,
    sign.color,
    sign.shape,
    sign.video_url || "",
    sign.sort_order ?? 0,
  ]);

  const handleSave = async () => {
    setSaving(true);
    const hotInstance = hotTableRef[0];

    if (hotInstance) {
      const data = hotInstance.getData();

      try {
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const { error } = await supabase
            .from("traffic_signs")
            .update({
              name_english: row[1],
              name_hindi: row[2],
              meaning: row[3],
              hindi_meaning: row[4],
              explanation: row[5],
              real_life_example: row[6],
              color: row[7],
              shape: row[8],
              video_url: row[9] || null,
              sort_order: row[10],
            })
            .eq("id", row[0]);

          if (error) throw error;
        }

        showToast("All changes saved!", "success");
        onSave([]);
        onClose();
      } catch (error: any) {
        showToast("Error: " + error.message, "error");
      }
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-[95vw] max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">📊 Excel Editor</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <HotTable
            ref={(ref) => {
              hotTableRef[0] = ref?.hotInstance;
            }}
            data={tableData}
            colHeaders={[
              "ID",
              "English",
              "Hindi",
              "Meaning",
              "Hindi Meaning",
              "Explanation",
              "Example",
              "Color",
              "Shape",
              "Video URL",
              "Sort",
            ]}
            columns={[
              { readOnly: true, width: 80 },
              { width: 120 },
              { width: 120 },
              { width: 150 },
              { width: 150 },
              { width: 200 },
              { width: 200 },
              { width: 100 },
              { width: 100 },
              { width: 150 },
              { width: 80 },
            ]}
            rowHeaders={true}
            width="100%"
            height="500px"
            licenseKey="non-commercial-and-evaluation"
            contextMenu={true}
            undo={true}
            colWidths={[80, 120, 120, 150, 150, 200, 200, 100, 100, 150, 80]}
            stretchH="all"
          />
        </div>

        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border rounded">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-green-600 text-white rounded"
          >
            {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      </div>
    </div>
  );
}
