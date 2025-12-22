"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ClimbingBoxLoader } from "react-spinners";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { HotTable } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import Handsontable from "handsontable";
interface Question {
  id: string;
  question: string;
  serial_number: string;
  serial_index: number;
  option_a: string;
  option_b: string;
  correct_answer: "A" | "B";
  explanation?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  category_id?: string | null;
  created_at: string;
  updated_at: string;
}
interface Category {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}
// Helper function to detect and embed videos
// ✅ FIXED: Now handles BOTH images AND videos
const getVideoEmbed = (url: string, className: string) => {
  if (!url) return null;

  // Check for image files FIRST
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) {
    return <img src={url} alt="Media" className={className} />;
  }

  // YouTube
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    let videoId = "";
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1].split("?")[0];
    } else if (url.includes("v=")) {
      videoId = url.split("v=")[1].split("&")[0];
    }
    return (
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        className={className}
        allowFullScreen
      />
    );
  }

  // Vimeo
  if (url.includes("vimeo.com")) {
    const videoId = url.split("vimeo.com/")[1].split("?")[0];
    return (
      <iframe
        src={`https://player.vimeo.com/video/${videoId}`}
        className={className}
        allowFullScreen
      />
    );
  }

  // Direct video file
  if (url.match(/\.(mp4|webm|ogg)$/i)) {
    return <video src={url} controls className={className} />;
  }

  // Generic iframe for any other streaming platform
  return <iframe src={url} className={className} allowFullScreen />;
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [viewingQuestion, setViewingQuestion] = useState<Question | null>(null);
  const itemsPerPage = 10;
  const router = useRouter();
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [answerFilter, setAnswerFilter] = useState<
    "ALL" | "CORRECT" | "INCORRECT"
  >("ALL");
  const [mediaFilter, setMediaFilter] = useState<"ALL" | "WITH" | "WITHOUT">(
    "ALL"
  );
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [mediaQuestion, setMediaQuestion] = useState<Question | null>(null);
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Map<string, any>>(
    new Map()
  );
  const [isExcelMode, setIsExcelMode] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(
    new Set()
  );
  useEffect(() => {
    fetchQuestions();
    fetchCategories();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/auth/login");
      }
    });
  }, [router]);
  //
  const exportToExcel = () => {
    const data = [
      {
        Question: "",
        "Option A": "",
        "Option B": "",
        "Correct Answer (A/B)": "",
        "Video URL": "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions Format");
    XLSX.writeFile(workbook, "questions_format_template.xlsx");
  };
  //
  const parseAnswerColumn = (text: string) => {
    const [status, explanation] = text.split("*");
    return {
      status: status.trim().toUpperCase(), // CORRECT / INCORRECT
      explanation: explanation?.trim() || null,
    };
  };
  //
  const importFromExcel = async (file: File) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

      const valid: any[] = [];
      const invalid: any[] = [];
      rows.forEach((row, index) => {
        const optionAStatus = String(row["Option A"] || "")
          .trim()
          .toUpperCase();

        const optionBStatus = String(row["Option B"] || "")
          .trim()
          .toUpperCase();

        const answerCol = parseAnswerColumn(
          String(row["Correct Answer (A/B)"] || "")
        );

        let correctAnswer: "A" | "B" | null = null;
        let explanation: string | null = answerCol.explanation;

        if (answerCol.status === "CORRECT") {
          correctAnswer = optionAStatus === "CORRECT" ? "A" : "B";
        } else if (answerCol.status === "INCORRECT") {
          correctAnswer = optionAStatus === "INCORRECT" ? "A" : "B";
        }

        const isValid =
          row["Question"] &&
          (optionAStatus === "CORRECT" || optionAStatus === "INCORRECT") &&
          (optionBStatus === "CORRECT" || optionBStatus === "INCORRECT") &&
          correctAnswer !== null;

        if (isValid) {
          const videoUrl =
            row["Video URL"] && String(row["Video URL"]).trim() !== ""
              ? String(row["Video URL"]).trim()
              : null;
          const serialIndex = index + 1;
          const serialNumber = `Q-${serialIndex}`;

          valid.push({
            serial_number: serialNumber,
            serial_index: serialIndex,
            question: String(row["Question"]).trim(),
            option_a: optionAStatus,
            option_b: optionBStatus,
            correct_answer: correctAnswer,
            explanation,
            media_url: videoUrl,
            media_type: videoUrl ? "video" : null,
          });
        } else {
          invalid.push({ row: index + 2, data: row });
        }
      });

      setPreviewRows(valid);
      setInvalidRows(invalid);
      setShowImportPreview(true);
    };

    reader.readAsArrayBuffer(file);
  };
  //
  const filterDuplicates = async (rows: any[]) => {
    const { data } = await supabase.from("questions").select("question");

    const existingQuestions = new Set(
      (data || []).map((q) => q.question.toLowerCase().trim())
    );

    return rows.filter(
      (row) => !existingQuestions.has(row.question.toLowerCase().trim())
    );
  };
  //
  const uploadMediaForQuestion = async (question: Question, file: File) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${question.id}_${Date.now()}.${fileExt}`;
    const filePath = `questions/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("question-media")
      .upload(filePath, file);

    if (uploadError) {
      alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage
      .from("question-media")
      .getPublicUrl(filePath);

    await supabase
      .from("questions")
      .update({
        media_url: data.publicUrl,
        media_type: file.type.startsWith("video") ? "video" : "image",
        updated_at: new Date().toISOString(),
      })
      .eq("id", question.id);

    fetchQuestions();
  };

  //
  const confirmImport = async () => {
    if (!previewRows.length) return;

    setImporting(true);

    const uniqueRows = await filterDuplicates(previewRows);

    if (!uniqueRows.length) {
      alert("All rows are duplicates");
      setImporting(false);
      return;
    }

    await importInChunks(uniqueRows);
  };

  //
  const importInChunks = async (rows: any[], chunkSize = 20) => {
    const total = rows.length;
    let inserted = 0;

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize).map((row) => ({
        ...row,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("questions").insert(chunk);

      if (error) {
        alert("Import stopped: " + error.message);
        break;
      }

      inserted += chunk.length;
      setProgress(Math.round((inserted / total) * 100));
    }

    setImporting(false);
    setShowImportPreview(false);
    setPreviewRows([]);
    setInvalidRows([]);
    setProgress(0);

    fetchQuestions();
  };

  //
  const fetchQuestions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("serial_index", { ascending: true });

    if (error) {
      console.error("Error fetching questions:", error);
      alert("Error fetching questions: " + error.message);
    } else {
      setQuestions(data || []);
    }
    setLoading(false);
  };
  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching categories:", error);
    } else {
      setCategories(data || []);
    }
  };
  const handleCellEdit = (changes: any[]) => {
    const newChanges = new Map(pendingChanges);

    changes.forEach(([row, col, oldValue, newValue]) => {
      const questionId = filteredQuestions[row].id;

      if (!newChanges.has(questionId)) {
        newChanges.set(questionId, { ...filteredQuestions[row] });
      }

      const question = newChanges.get(questionId);
      const fieldMap = [
        "serial_number",
        "question",
        "option_a",
        "option_b",
        "correct_answer",
        "explanation",
        "media_url",
        "id",
      ];
      const fieldName = fieldMap[col];

      if (fieldName) {
        question[fieldName] = newValue;
      }
    });

    setPendingChanges(newChanges);
  };
  const handleSaveAllChanges = async () => {
    if (pendingChanges.size === 0) return;

    setLoading(true);

    for (const [id, question] of pendingChanges.entries()) {
      await supabase
        .from("questions")
        .update({
          question: question.question,
          option_a: question.option_a,
          option_b: question.option_b,
          correct_answer: question.correct_answer,
          explanation: question.explanation || null,
          media_url: question.media_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    setPendingChanges(new Map());
    await fetchQuestions();
    setLoading(false);
    setIsExcelMode(false); // ← ADD THIS LINE - Switch back to list view
    alert("All changes saved successfully!");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    const { error } = await supabase.from("questions").delete().eq("id", id);

    if (error) {
      alert("Error deleting question: " + error.message);
    } else {
      fetchQuestions();
    }
  };

  const handleAdd = () => {
    setEditingQuestion(null);
    setShowModal(true);
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
    setShowModal(true);
  };

  const handleView = (question: Question) => {
    setViewingQuestion(question);
  };

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch = q.question
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    const actualStatus = q.correct_answer === "A" ? q.option_a : q.option_b;
    const matchesAnswer =
      answerFilter === "ALL" || actualStatus === answerFilter;

    const matchesMedia =
      mediaFilter === "ALL" ||
      (mediaFilter === "WITH" && q.media_url) ||
      (mediaFilter === "WITHOUT" && !q.media_url);

    // Add category filter
    const matchesCategory =
      selectedCategory === "ALL" ||
      (selectedCategory === "UNCATEGORIZED" && !q.category_id) ||
      q.category_id === selectedCategory;

    return matchesSearch && matchesAnswer && matchesMedia && matchesCategory;
  });
  //
  const handleBulkAddToCategory = async () => {
    if (!bulkCategoryId || selectedQuestions.size === 0) {
      alert("Please select a category and at least one question");
      return;
    }

    setLoading(true);

    for (const questionId of selectedQuestions) {
      await supabase
        .from("questions")
        .update({
          category_id: bulkCategoryId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", questionId);
    }

    setSelectedQuestions(new Set());
    setBulkCategoryId("");
    setShowBulkCategoryModal(false);
    await fetchQuestions();
    setLoading(false);
    alert(`${selectedQuestions.size} questions added to category!`);
  };

  const handleBulkRemoveFromCategory = async () => {
    if (selectedQuestions.size === 0) {
      alert("Please select at least one question");
      return;
    }

    if (
      !confirm(
        `Remove ${selectedQuestions.size} questions from their categories?`
      )
    ) {
      return;
    }

    setLoading(true);

    for (const questionId of selectedQuestions) {
      await supabase
        .from("questions")
        .update({
          category_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", questionId);
    }

    setSelectedQuestions(new Set());
    await fetchQuestions();
    setLoading(false);
    alert("Questions removed from categories!");
  };

  const handleSelectAll = () => {
    if (selectedQuestions.size === filteredQuestions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(filteredQuestions.map((q) => q.id)));
    }
  };

  const toggleQuestionSelection = (id: string) => {
    const newSelection = new Set(selectedQuestions);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedQuestions(newSelection);
  };
  // Pagination logic
  const totalPages = Math.ceil(filteredQuestions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentQuestions = filteredQuestions.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-light text-gray-900">Questions</h1>
            <p className="text-xs text-gray-500 mt-1">
              {filteredQuestions.length}{" "}
              {filteredQuestions.length === 1 ? "question" : "questions"}
              {selectedQuestions.size > 0 &&
                ` (${selectedQuestions.size} selected)`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-2 border border-gray-300 text-xs font-medium hover:border-gray-900 transition-colors"
            >
              Categories
            </button>

            {selectedQuestions.size > 0 && (
              <>
                <button
                  onClick={() => setShowBulkCategoryModal(true)}
                  className="px-3 py-2 bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                >
                  Add to Category
                </button>
                <button
                  onClick={handleBulkRemoveFromCategory}
                  className="px-3 py-2 bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
                >
                  Remove
                </button>
              </>
            )}

            <button
              onClick={() => document.getElementById("excel-import")?.click()}
              className="px-3 py-2 border border-gray-300 text-xs font-medium hover:border-gray-900 transition-colors"
            >
              Import
            </button>

            <button
              onClick={exportToExcel}
              className="px-3 py-2 border border-gray-300 text-xs font-medium hover:border-gray-900 transition-colors"
            >
              Template
            </button>

            <button
              onClick={handleAdd}
              className="px-3 py-2 bg-black text-white text-xs font-medium hover:bg-gray-800 transition-colors"
            >
              Add Question
            </button>

            {!isExcelMode ? (
              <button
                onClick={() => setIsExcelMode(true)}
                className="px-3 py-2 border border-gray-300 text-xs font-medium hover:border-gray-900 transition-colors"
              >
                Bulk Edit
              </button>
            ) : (
              <button
                onClick={() => {
                  if (pendingChanges.size > 0) {
                    if (
                      confirm(
                        "You have unsaved changes. Do you want to discard them?"
                      )
                    ) {
                      setPendingChanges(new Map());
                      setIsExcelMode(false);
                    }
                  } else {
                    setIsExcelMode(false);
                  }
                }}
                className="px-3 py-2 border border-gray-300 text-xs font-medium hover:border-gray-900 transition-colors"
              >
                Back
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 text-xs focus:outline-none focus:border-gray-900"
          />
        </div>

        {/* Category Filter */}
        <div className="mb-6 flex gap-3 items-center">
          <label className="text-xs font-medium text-gray-700">Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 text-xs focus:outline-none focus:border-gray-900"
          >
            <option value="ALL">All Categories</option>
            <option value="UNCATEGORIZED">Uncategorized</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {selectedQuestions.size > 0 && (
            <button
              onClick={() => setSelectedQuestions(new Set())}
              className="ml-auto text-xs text-gray-600 hover:text-gray-900"
            >
              Clear ({selectedQuestions.size})
            </button>
          )}
        </div>
        {/* Questions Table */}
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <ClimbingBoxLoader color="#000000" loading={loading} size={15} />
            </div>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400">
              {searchTerm
                ? "No questions found matching your search"
                : "No questions found. Add your first question!"}
            </p>
          </div>
        ) : !isExcelMode ? (
          <>
            {/* Regular Table View */}
            <div className="border border-gray-200 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={
                          selectedQuestions.size === filteredQuestions.length &&
                          filteredQuestions.length > 0
                        }
                        onChange={handleSelectAll}
                        className="w-3 h-3"
                      />
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">
                      S.No
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Question
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                      Category
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                      Media
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                      Answer
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                      Created
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentQuestions.map((question) => (
                    <tr key={question.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedQuestions.has(question.id)}
                          onChange={() => toggleQuestionSelection(question.id)}
                          className="w-3 h-3"
                        />
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="text-xs font-semibold text-gray-900">
                          {question.serial_number}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-900 max-w-md truncate">
                          {question.question}
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        {question.category_id ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {categories.find(
                              (c) => c.id === question.category_id
                            )?.name || "Unknown"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">N/A</span>
                        )}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        {question.media_url ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                              {question.media_type === "video" ? "📹" : "🖼️"}
                            </span>
                            <button
                              onClick={() => handleEdit(question)}
                              className="text-[10px] underline text-gray-600 hover:text-gray-900"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setMediaQuestion(question);
                              setMediaUrlInput("");
                            }}
                            className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          >
                            Add
                          </button>
                        )}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        <div
                          className={`text-xs font-semibold ${
                            (question.correct_answer === "A"
                              ? question.option_a
                              : question.option_b) === "CORRECT"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {question.correct_answer === "A"
                            ? question.option_a
                            : question.option_b}
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500">
                        {new Date(question.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <button
                          onClick={() => handleView(question)}
                          className="text-gray-700 hover:text-gray-900 mr-2 transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(question)}
                          className="text-gray-700 hover:text-gray-900 mr-2 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(question.id)}
                          className="text-gray-700 hover:text-red-600 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-300 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-900 transition-colors"
                >
                  Previous
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
                            className={`px-2.5 py-1.5 border text-xs transition-colors ${
                              currentPage === page
                                ? "bg-black text-white border-black"
                                : "border-gray-300 hover:border-gray-900"
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
                            className="px-1 py-1.5 text-gray-400 text-xs"
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
                  className="px-3 py-1.5 border border-gray-300 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-900 transition-colors"
                >
                  Next
                </button>
              </div>
            )}

            <div className="text-center text-xs text-gray-500 mt-3">
              Showing {startIndex + 1}-
              {Math.min(endIndex, filteredQuestions.length)} of{" "}
              {filteredQuestions.length}
            </div>

            {/* Page Info */}
            <div className="text-center text-sm text-gray-500 mt-4">
              Showing {startIndex + 1}-
              {Math.min(endIndex, filteredQuestions.length)} of{" "}
              {filteredQuestions.length}
            </div>
          </>
        ) : (
          <>
            {/* Excel-like Editable Table */}
            <div className="mb-6">
              <div style={{ width: "100%", height: "600px", overflow: "auto" }}>
                <HotTable
                  data={filteredQuestions.map((q) => [
                    q.serial_number,
                    q.question,
                    q.option_a,
                    q.option_b,
                    q.correct_answer,
                    q.explanation || "",
                    q.media_url || "",
                    q.id,
                  ])}
                  colHeaders={[
                    "S.No",
                    "Question",
                    "Option A",
                    "Option B",
                    "Answer",
                    "Explanation",
                    "Media URL",
                    "ID",
                  ]}
                  columns={[
                    { data: 0, readOnly: true },
                    { data: 1 },
                    { data: 2 },
                    { data: 3 },
                    { data: 4 },
                    { data: 5 },
                    { data: 6 },
                    { data: 7, readOnly: true },
                  ]}
                  colWidths={[80, 300, 150, 150, 100, 200, 200, 0]}
                  hiddenColumns={{ columns: [7] }}
                  width="100%"
                  height={500}
                  rowHeaders={true}
                  contextMenu={true}
                  manualColumnResize={true}
                  licenseKey="non-commercial-and-evaluation"
                  afterChange={(changes, source) => {
                    if (source === "edit" && changes) {
                      handleCellEdit(changes);
                    }
                  }}
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-between items-center p-4 bg-gray-50 border border-gray-200">
              <div className="text-sm">
                {pendingChanges.size > 0 ? (
                  <span className="font-medium text-orange-600">
                    ⚠️ {pendingChanges.size} unsaved change
                    {pendingChanges.size > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-gray-500">✓ No changes</span>
                )}
              </div>
              <button
                onClick={handleSaveAllChanges}
                disabled={pendingChanges.size === 0}
                className="px-6 py-3 bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save All Changes ({pendingChanges.size})
              </button>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <QuestionModal
          question={editingQuestion}
          onClose={() => setShowModal(false)}
          onSave={fetchQuestions}
        />
      )}

      {/* View Modal */}
      {viewingQuestion && (
        <QuestionViewModal
          question={viewingQuestion}
          onClose={() => setViewingQuestion(null)}
        />
      )}
      {showImportPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6">
            <h2 className="text-xl font-medium text-gray-900 mb-4">
              Import Preview
            </h2>

            {/* Valid rows */}
            <p className="text-sm text-gray-700 mb-2">
              ✅ Valid rows: {previewRows.length}
              {invalidRows.length > 0 && (
                <span className="text-red-600 ml-4">
                  ❌ Invalid rows: {invalidRows.length}
                </span>
              )}
            </p>

            <div className="border border-gray-200 max-h-64 overflow-y-auto mb-4">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">S.No</th>
                    <th className="px-3 py-2 text-left">Question</th>
                    <th className="px-3 py-2 text-left">A</th>
                    <th className="px-3 py-2 text-left">B</th>

                    <th className="px-3 py-2 text-left">Explanation</th>

                    <th className="px-3 py-2 text-left">Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">{row.question}</td>
                      <td className="px-3 py-2">{row.option_a}</td>
                      <td className="px-3 py-2">{row.option_b}</td>

                      <td className="px-3 py-2">{row.explanation || "-"}</td>

                      <td className="px-3 py-2 font-semibold">
                        {row.correct_answer}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invalid rows */}
            {invalidRows.length > 0 && (
              <div className="text-sm text-red-600 mb-4">
                Invalid rows (skipped):{" "}
                {invalidRows.map((r) => r.row).join(", ")}
              </div>
            )}
            {importing && (
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-1">
                  Importing... {progress}%
                </div>
                <div className="w-full bg-gray-200 h-2">
                  <div
                    className="bg-black h-2 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowImportPreview(false)}
                className="flex-1 border border-gray-300 py-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={importing}
                className="flex-1 bg-black text-white py-2 disabled:opacity-50"
              >
                {importing ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        id="excel-import"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importFromExcel(file);
          e.target.value = "";
        }}
      />
      {/* Bulk Category Assignment Modal */}
      {showBulkCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-6">
            <h3 className="text-lg font-medium mb-4">
              Add Questions to Category
            </h3>

            <p className="text-sm text-gray-600 mb-4">
              {selectedQuestions.size} question
              {selectedQuestions.size > 1 ? "s" : ""} selected
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Category
              </label>
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
              >
                <option value="">-- Choose Category --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowBulkCategoryModal(false);
                  setBulkCategoryId("");
                }}
                className="flex-1 border border-gray-300 py-2 text-sm hover:border-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAddToCategory}
                disabled={!bulkCategoryId}
                className="flex-1 bg-black text-white py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                Add to Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <CategoryManagementModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onSave={fetchCategories}
        />
      )}
      {mediaQuestion && (
        <div className="fixed inset-0 bg-black/30 bg-opacity-10 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-6">
            <h3 className="text-lg font-medium mb-4">Add Media</h3>

            {/* File Upload Option */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload File
              </label>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    (window as any).tempMediaFile = file;
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Upload image or video file
              </p>
            </div>

            {/* OR Divider */}
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-sm text-gray-500">OR</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>

            {/* URL Input Option */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video URL
              </label>
              <input
                type="text"
                placeholder="YouTube, Vimeo, or direct video URL"
                value={mediaUrlInput}
                onChange={(e) => setMediaUrlInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste YouTube, Vimeo, or .mp4 video link
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMediaQuestion(null);
                  setMediaUrlInput("");
                  (window as any).tempMediaFile = null;
                }}
                className="flex-1 border py-2 text-sm"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  const file = (window as any).tempMediaFile;
                  const url = mediaUrlInput.trim();

                  if (!file && !url) {
                    alert("Please upload a file or enter a video URL");
                    return;
                  }

                  let mediaUrl = null;
                  let mediaType = null;

                  // Handle file upload
                  if (file) {
                    const fileExt = file.name.split(".").pop();
                    const fileName = `${
                      mediaQuestion.id
                    }_${Date.now()}.${fileExt}`;
                    const filePath = `questions/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                      .from("question-media")
                      .upload(filePath, file);

                    if (uploadError) {
                      alert("Upload failed: " + uploadError.message);
                      return;
                    }

                    const { data } = supabase.storage
                      .from("question-media")
                      .getPublicUrl(filePath);

                    mediaUrl = data.publicUrl;
                    mediaType = file.type.startsWith("video")
                      ? "video"
                      : "image";
                  }
                  // Handle URL
                  else if (url) {
                    mediaUrl = url;
                    const isVideo =
                      url.includes("youtube") ||
                      url.includes("youtu.be") ||
                      url.includes("vimeo") ||
                      url.match(/\.(mp4|webm|ogg)$/i);
                    mediaType = isVideo ? "video" : "image";
                  }

                  await supabase
                    .from("questions")
                    .update({
                      media_url: mediaUrl,
                      media_type: mediaType,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", mediaQuestion.id);

                  setMediaQuestion(null);
                  setMediaUrlInput("");
                  (window as any).tempMediaFile = null;
                  fetchQuestions();
                }}
                className="flex-1 bg-black text-white py-2 text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add/Edit Modal Component
function QuestionModal({
  question,
  onClose,
  onSave,
}: {
  question: Question | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState<{
    question: string;
    option_a: string;
    option_b: string;
    correct_answer: "A" | "B";
    explanation?: string;
  }>({
    question: question?.question || "",
    option_a: question?.option_a || "",
    option_b: question?.option_b || "",
    correct_answer: question?.correct_answer ?? "A",
    explanation: question?.explanation || "",
  });
  //
  const [videoUrl, setVideoUrl] = useState<string>(
    question?.media_type === "video" ? question.media_url || "" : ""
  );

  //

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(
    question?.media_url || null
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.question.trim() ||
      !formData.option_a.trim() ||
      !formData.option_b.trim()
    ) {
      alert("Please fill in all fields");
      return;
    }

    setSaving(true);

    let mediaUrl = question?.media_url || null;
    let mediaType = question?.media_type || null;
    // If video URL is provided, use it directly
    if (videoUrl.trim()) {
      mediaUrl = videoUrl.trim();
      mediaType = "video";
    }

    // Upload new media file if selected
    if (mediaFile) {
      setUploading(true);
      const fileExt = mediaFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}.${fileExt}`;
      const filePath = `questions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("question-media")
        .upload(filePath, mediaFile);

      if (uploadError) {
        alert("Error uploading file: " + uploadError.message);
        setSaving(false);
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("question-media")
        .getPublicUrl(filePath);

      mediaUrl = urlData.publicUrl;
      mediaType = mediaFile.type.startsWith("video") ? "video" : "image";
      setUploading(false);
    }

    // Remove media if explicitly cleared
    if (!mediaFile && !mediaPreview && !videoUrl.trim()) {
      mediaUrl = null;
      mediaType = null;
    }

    const questionData = {
      question: formData.question,
      option_a: formData.option_a,
      option_b: formData.option_b,
      correct_answer: formData.correct_answer,
      explanation: formData.explanation,
      media_url: mediaUrl,
      media_type: mediaType,
      updated_at: new Date().toISOString(),
    };

    if (question) {
      // Update existing question
      const { error } = await supabase
        .from("questions")
        .update(questionData)
        .eq("id", question.id);

      if (error) {
        alert("Error updating question: " + error.message);
      } else {
        onSave();
        onClose();
      }
    } else {
      // Create new question
      const { error } = await supabase.from("questions").insert([questionData]);

      if (error) {
        alert("Error creating question: " + error.message);
      } else {
        onSave();
        onClose();
      }
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-light text-gray-900">
            {question ? "Edit Question" : "Add New Question"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
              placeholder="Enter your question..."
            />
          </div>

          {/* Options */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Options <span className="text-red-500">*</span>
            </label>

            {/* Option A */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Option A
              </label>
              <input
                type="text"
                value={formData.option_a}
                onChange={(e) =>
                  setFormData({ ...formData, option_a: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
                placeholder="Enter option A..."
              />
            </div>

            {/* Option B */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Option B
              </label>
              <input
                type="text"
                value={formData.option_b}
                onChange={(e) =>
                  setFormData({ ...formData, option_b: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
                placeholder="Enter option B..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explanation
            </label>
            <textarea
              value={formData.explanation || ""}
              onChange={(e) =>
                setFormData({ ...formData, explanation: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 text-sm"
            />
          </div>

          {/* Correct Answer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correct Answer <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.correct_answer}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  correct_answer: e.target.value as "A" | "B",
                })
              }
              className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
            >
              <option value="A">Option A</option>
              <option value="B">Option B</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video URL (Optional)
            </label>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="YouTube / Vimeo / mp4 URL"
              className="w-full px-3 py-2 border border-gray-300 text-sm"
            />
          </div>

          {/* Media Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Media (Optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Upload a file OR enter a video URL below (not both)
            </p>

            {mediaPreview ? (
              <div className="space-y-2">
                {question?.media_url ? (
                  getVideoEmbed(
                    mediaPreview,
                    "w-full h-64 border border-gray-300"
                  )
                ) : mediaFile?.type.startsWith("video") ? (
                  <video
                    src={mediaPreview}
                    controls
                    className="w-full max-h-64 border border-gray-300"
                  />
                ) : (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="w-full max-h-64 object-contain border border-gray-300"
                  />
                )}
                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove Media
                </button>
              </div>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  disabled={!!videoUrl.trim()}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900 disabled:opacity-50 mb-3"
                />
                {videoUrl.trim() && (
                  <p className="text-xs text-gray-500">
                    File upload disabled because video URL is set
                  </p>
                )}
              </>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 text-sm font-medium hover:border-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving
                ? uploading
                  ? "Uploading..."
                  : "Saving..."
                : question
                ? "Update"
                : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// View Modal Component
function QuestionViewModal({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-light text-gray-900">Question Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Serial Number
            </label>
            <div className="px-3 py-2 border border-gray-200 text-sm font-semibold text-gray-900">
              {question.serial_number}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question
            </label>
            <div className="px-3 py-2 border border-gray-200 text-sm text-gray-900">
              {question.question}
            </div>
          </div>

          {question.media_url && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attached Media
              </label>
              {getVideoEmbed(
                question.media_url,
                "w-full h-96 border border-gray-200"
              ) || (
                <img
                  src={question.media_url}
                  alt="Question media"
                  className="w-full max-h-96 object-contain border border-gray-200"
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Options
            </label>
            <div className="space-y-2">
              <div
                className={`px-3 py-2 border text-sm ${
                  question.correct_answer === "A"
                    ? "border-green-500 bg-green-50 text-green-900"
                    : "border-gray-200 text-gray-900"
                }`}
              >
                <span className="font-medium">A:</span> {question.option_a}
                {question.correct_answer === "A" && (
                  <span className="ml-2 text-xs text-green-600">
                    ✓ Correct Answer
                  </span>
                )}
              </div>
              <div
                className={`px-3 py-2 border text-sm ${
                  question.correct_answer === "B"
                    ? "border-green-500 bg-green-50 text-green-900"
                    : "border-gray-200 text-gray-900"
                }`}
              >
                <span className="font-medium">B:</span> {question.option_b}
                {question.correct_answer === "B" && (
                  <span className="ml-2 text-xs text-green-600">
                    ✓ Correct Answer
                  </span>
                )}
              </div>
            </div>
          </div>
          {question.explanation && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Explanation
              </label>
              <div className="px-3 py-2 border border-gray-200 text-sm text-gray-900">
                {question.explanation}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Created At
              </label>
              <div className="px-3 py-2 border border-gray-200 text-sm text-gray-500">
                {new Date(question.created_at).toLocaleString()}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Updated At
              </label>
              <div className="px-3 py-2 border border-gray-200 text-sm text-gray-500">
                {new Date(question.updated_at).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full py-3 border border-gray-300 text-sm font-medium hover:border-gray-900 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
// Category Management Modal Component
function CategoryManagementModal({
  categories,
  onClose,
  onSave,
}: {
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) {
      alert("Please enter a category name");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("categories").insert([
      {
        name: categoryName.trim(),
        description: categoryDescription.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      alert("Error creating category: " + error.message);
    } else {
      setCategoryName("");
      setCategoryDescription("");
      onSave();
    }
    setLoading(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !categoryName.trim()) return;

    setLoading(true);
    const { error } = await supabase
      .from("categories")
      .update({
        name: categoryName.trim(),
        description: categoryDescription.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingCategory.id);

    if (error) {
      alert("Error updating category: " + error.message);
    } else {
      setEditingCategory(null);
      setCategoryName("");
      setCategoryDescription("");
      onSave();
    }
    setLoading(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category? Questions will become uncategorized."))
      return;

    setLoading(true);
    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) {
      alert("Error deleting category: " + error.message);
    } else {
      onSave();
    }
    setLoading(false);
  };

  const startEdit = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDescription(category.description || "");
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDescription("");
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-light text-gray-900">
            Manage Categories
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Create/Edit Form */}
          <div className="border border-gray-200 p-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-900">
              {editingCategory ? "Edit Category" : "Create New Category"}
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category Name *
              </label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Science, History, Math"
                className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of this category"
                className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900"
              />
            </div>

            <div className="flex gap-2">
              {editingCategory && (
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 border border-gray-300 text-sm hover:border-gray-900"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={
                  editingCategory ? handleUpdateCategory : handleCreateCategory
                }
                disabled={loading}
                className="px-4 py-2 bg-black text-white text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Saving..." : editingCategory ? "Update" : "Create"}
              </button>
            </div>
          </div>

          {/* Existing Categories */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Existing Categories ({categories.length})
            </h3>

            {categories.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No categories yet. Create your first one above!
              </p>
            ) : (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 border border-gray-200 hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">
                        {category.name}
                      </div>
                      {category.description && (
                        <div className="text-xs text-gray-500 mt-1">
                          {category.description}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(category)}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
