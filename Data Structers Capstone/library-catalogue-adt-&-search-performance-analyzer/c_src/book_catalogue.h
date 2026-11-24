#ifndef BOOK_CATALOGUE_H
#define BOOK_CATALOGUE_H

#include <stddef.h>

/*
 * ============================================================================
 * LIBRARY CATALOGUE ADT (Abstract Data Type) — Public Header
 * ============================================================================
 * Student:      MOLAGAMODI KISHORE (Reg. No: 192411062)
 * Course:       Data Structures (CSA 0306)
 * Project:      Library Catalogue ADT and Search Performance Analyzer
 *
 * Encapsulation Guarantee:
 *   The Catalogue structure is declared as an opaque type. Client programs
 *   (including main.c) cannot directly access the internal dynamic array,
 *   size, or capacity fields; all mutations and queries go through this API.
 * ============================================================================
 */

#define BOOK_ISBN_MAX   32
#define BOOK_TITLE_MAX  128
#define BOOK_AUTHOR_MAX 96
#define CAT_MIN_CAPACITY 16
#define MAX_TRACE_STEPS 256

/* Status codes returned by ADT operations */
typedef enum {
    CAT_OK = 0,
    CAT_ERR_NULL_PTR = -1,
    CAT_ERR_MEMORY = -2,
    CAT_ERR_DUPLICATE_ISBN = -3,
    CAT_ERR_NOT_FOUND = -4,
    CAT_ERR_INVALID_INPUT = -5,
    CAT_ERR_INVALID_POSITION = -6,
    CAT_ERR_ORDER_VIOLATION = -7,
    CAT_ERR_IO = -8
} CatalogueStatus;

/* Public Book record structure */
typedef struct {
    char isbn[BOOK_ISBN_MAX];
    char title[BOOK_TITLE_MAX];
    char author[BOOK_AUTHOR_MAX];
    int copies;
} Book;

/* Opaque ADT handle — implementation hidden in book_catalogue.c */
typedef struct Catalogue Catalogue;

/* Single step captured during a search execution for visualization */
typedef struct {
    int step_number;
    int index;
    int low;
    int high;
    int mid;
    int recursion_depth;
    int cmp_result; /* <0: current < target, 0: match, >0: current > target */
    char examined_isbn[BOOK_ISBN_MAX];
} SearchStep;

/* Complete execution trace and telemetry from a search algorithm */
typedef struct {
    int found;
    int index;
    long comparisons;
    int recursive_calls;
    int max_recursion_depth;
    double elapsed_us;
    Book book;
    int trace_count;
    int trace_truncated;
    SearchStep steps[MAX_TRACE_STEPS];
} SearchResult;

/* Operation metadata for insert/delete instrumentation */
typedef struct {
    int final_index;
    int shift_count;
    int capacity_changed; /* 1 = expanded, -1 = shrunk, 0 = unchanged */
    size_t old_capacity;
    size_t new_capacity;
    double elapsed_us;
} MutationMetrics;

/* Aggregated benchmark results for one algorithm on one dataset size */
typedef struct {
    size_t dataset_size;
    const char *algorithm;
    int best_trials;
    long best_comparisons;
    double best_time_us;
    int best_rec_calls;
    int best_stack_depth;

    int avg_trials;
    double avg_comparisons;
    double avg_time_us;
    double avg_rec_calls;
    double avg_stack_depth;

    int worst_trials;
    long worst_comparisons;
    double worst_time_us;
    int worst_rec_calls;
    int worst_stack_depth;
} BenchmarkSummary;

/* Callback signature for opaque traversal */
typedef void (*CatalogueVisitor)(size_t index, const Book *book, void *user_data);

/* --- Lifecycle Management --- */
Catalogue *catalogue_create(size_t initial_capacity);
void catalogue_destroy(Catalogue *cat);

/* --- Accessors (Encapsulated Queries) --- */
size_t catalogue_size(const Catalogue *cat);
size_t catalogue_capacity(const Catalogue *cat);
long catalogue_total_copies(const Catalogue *cat);
size_t catalogue_memory_bytes(const Catalogue *cat);
CatalogueStatus catalogue_get_at(const Catalogue *cat, size_t index, Book *out_book);

/* --- Core ADT Operations --- */

/*
 * Inserts a book maintaining ascending ISBN order.
 * If target_position < 0, automatically locates the sorted insertion index.
 * If target_position >= 0, validates that placing the book at target_position
 * preserves ascending ISBN order (returning CAT_ERR_ORDER_VIOLATION otherwise).
 * Automatically doubles dynamic array capacity when full and rejects duplicates.
 */
CatalogueStatus catalogue_insert(
    Catalogue *cat,
    const Book *book,
    int target_position,
    MutationMetrics *metrics
);

/*
 * Deletes a book by ISBN, shifting subsequent elements left and halving
 * allocated capacity when utilization falls to <= 25% (above CAT_MIN_CAPACITY).
 */
CatalogueStatus catalogue_delete(
    Catalogue *cat,
    const char *isbn,
    MutationMetrics *metrics
);

/*
 * Updates copy count for an existing ISBN while preserving ascending ISBN order.
 */
CatalogueStatus catalogue_update_copies(
    Catalogue *cat,
    const char *isbn,
    int new_copies,
    double *elapsed_us
);

/*
 * Traverses all books in ascending ISBN order via a client visitor callback.
 */
CatalogueStatus catalogue_traverse(
    const Catalogue *cat,
    CatalogueVisitor visitor,
    void *user_data
);

/* --- Searching Algorithms --- */
CatalogueStatus catalogue_search_linear(
    const Catalogue *cat,
    const char *isbn,
    int capture_trace,
    SearchResult *result
);

CatalogueStatus catalogue_search_binary_iterative(
    const Catalogue *cat,
    const char *isbn,
    int capture_trace,
    SearchResult *result
);

CatalogueStatus catalogue_search_binary_recursive(
    const Catalogue *cat,
    const char *isbn,
    int capture_trace,
    SearchResult *result
);

/* --- Dataset Generation & Persistence --- */
CatalogueStatus catalogue_load_demo_data(Catalogue *cat);
CatalogueStatus catalogue_generate_dataset(Catalogue *cat, size_t count);
CatalogueStatus catalogue_save_file(const Catalogue *cat, const char *filepath);
CatalogueStatus catalogue_load_file(Catalogue *cat, const char *filepath);

/* --- Benchmarking Engine --- */
CatalogueStatus catalogue_benchmark_size(
    size_t dataset_size,
    BenchmarkSummary out_summaries[3]
);

const char *catalogue_status_string(CatalogueStatus status);

#endif /* BOOK_CATALOGUE_H */
