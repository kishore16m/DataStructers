#define _POSIX_C_SOURCE 200809L

#include "book_catalogue.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * ============================================================================
 * LIBRARY CATALOGUE ADT — Client Program & Server Engine (main.c)
 * ============================================================================
 * Student:      MOLAGAMODI KISHORE (Reg. No: 192411062)
 * Course:       Data Structures (CSA 0306)
 * Project:      Library Catalogue ADT and Search Performance Analyzer
 *
 * Strictly adheres to ADT encapsulation: never accesses Catalogue fields
 * directly; uses only the public functions declared in book_catalogue.h.
 *
 * Modes:
 *   1. Standalone CLI Demonstration (default):
 *        ./catalogue_engine
 *      Runs CREATE, INSERT, UPDATE, DELETE, TRAVERSE, Linear/Iterative Binary/
 *      Recursive Binary searches, and multi-size benchmarks to stdout.
 *
 *   2. Persistent JSON-RPC Engine Mode (used by Express backend):
 *        ./catalogue_engine --server <persistence_file>
 *      Reads tab-delimited commands from stdin and emits JSON lines on stdout.
 * ============================================================================
 */

/* Print a JSON-escaped string safely */
static void print_json_str(const char *s) {
    putchar('"');
    if (s) {
        for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
            switch (*p) {
                case '"':  fputs("\\\"", stdout); break;
                case '\\': fputs("\\\\", stdout); break;
                case '\b': fputs("\\b", stdout);  break;
                case '\f': fputs("\\f", stdout);  break;
                case '\n': fputs("\\n", stdout);  break;
                case '\r': fputs("\\r", stdout);  break;
                case '\t': fputs("\\t", stdout);  break;
                default:
                    if (*p < 0x20) {
                        printf("\\u%04x", *p);
                    } else {
                        putchar(*p);
                    }
            }
        }
    }
    putchar('"');
}

static void print_book_json(const Book *b, int index) {
    printf("{\"index\":%d,\"isbn\":", index);
    print_json_str(b->isbn);
    fputs(",\"title\":", stdout);
    print_json_str(b->title);
    fputs(",\"author\":", stdout);
    print_json_str(b->author);
    printf(",\"copies\":%d}", b->copies);
}

static void print_stats_json(const Catalogue *cat) {
    printf("{\"size\":%zu,\"capacity\":%zu,\"totalCopies\":%ld,\"memoryBytes\":%zu,\"loadFactor\":%.4f}",
           catalogue_size(cat),
           catalogue_capacity(cat),
           catalogue_total_copies(cat),
           catalogue_memory_bytes(cat),
           catalogue_capacity(cat) > 0
               ? (double)catalogue_size(cat) / (double)catalogue_capacity(cat)
               : 0.0);
}

/* Visitor for CLI table traversal */
static void cli_print_visitor(size_t index, const Book *book, void *user_data) {
    size_t max_rows = *(size_t *)user_data;
    if (index < max_rows) {
        printf("  [%2zu] %-18s | %-44.44s | %-22.22s | %3d\n",
               index, book->isbn, book->title, book->author, book->copies);
    }
}

/* Standalone Academic Evaluation Demonstration */
static int run_cli_demo(void) {
    printf("================================================================================\n");
    printf("  LIBRARY CATALOGUE ADT AND SEARCH PERFORMANCE ANALYZER\n");
    printf("  Student: MOLAGAMODI KISHORE | Reg No: 192411062 | Course: CSA 0306\n");
    printf("================================================================================\n\n");

    printf("[1] CREATE: Initializing Catalogue ADT with initial capacity 16...\n");
    Catalogue *cat = catalogue_create(16);
    if (!cat) {
        fprintf(stderr, "Failed to allocate Catalogue ADT.\n");
        return 1;
    }

    catalogue_load_demo_data(cat);
    printf("    Loaded %zu demo records | Capacity: %zu | Memory: %zu bytes | Copies: %ld\n\n",
           catalogue_size(cat), catalogue_capacity(cat),
           catalogue_memory_bytes(cat), catalogue_total_copies(cat));

    printf("[2] INSERT: Adding new book while maintaining ascending ISBN order...\n");
    Book extra = {
        "978-0-13-449416-6",
        "Clean Architecture: A Craftsman's Guide",
        "Robert C. Martin",
        10
    };
    MutationMetrics m;
    CatalogueStatus st = catalogue_insert(cat, &extra, -1, &m);
    printf("    Status: %s | Index: %d | Shifts: %d | Capacity: %zu -> %zu | Time: %.2f us\n",
           catalogue_status_string(st), m.final_index, m.shift_count,
           m.old_capacity, m.new_capacity, m.elapsed_us);

    printf("    Testing duplicate ISBN rejection...\n");
    st = catalogue_insert(cat, &extra, -1, &m);
    printf("    Duplicate Insert Status: %s\n\n", catalogue_status_string(st));

    printf("[3] UPDATE: Updating copies for ISBN %s to 18...\n", extra.isbn);
    double upd_us = 0.0;
    st = catalogue_update_copies(cat, extra.isbn, 18, &upd_us);
    printf("    Status: %s | Time: %.2f us\n\n", catalogue_status_string(st), upd_us);

    printf("[4] TRAVERSE: Displaying first 10 records in ascending ISBN order:\n");
    size_t limit = 10;
    catalogue_traverse(cat, cli_print_visitor, &limit);
    printf("    ... (%zu total records)\n\n", catalogue_size(cat));

    printf("[5] SEARCH ALGORITHMS (Target ISBN: 978-0-262-03384-8):\n");
    SearchResult r_lin, r_bin_i, r_bin_r;
    catalogue_search_linear(cat, "978-0-262-03384-8", 0, &r_lin);
    catalogue_search_binary_iterative(cat, "978-0-262-03384-8", 0, &r_bin_i);
    catalogue_search_binary_recursive(cat, "978-0-262-03384-8", 0, &r_bin_r);
    printf("    Linear Search:           found=%d idx=%d comparisons=%ld time=%.2f us\n",
           r_lin.found, r_lin.index, r_lin.comparisons, r_lin.elapsed_us);
    printf("    Iterative Binary Search: found=%d idx=%d comparisons=%ld time=%.2f us\n",
           r_bin_i.found, r_bin_i.index, r_bin_i.comparisons, r_bin_i.elapsed_us);
    printf("    Recursive Binary Search: found=%d idx=%d comparisons=%ld calls=%d depth=%d time=%.2f us\n\n",
           r_bin_r.found, r_bin_r.index, r_bin_r.comparisons,
           r_bin_r.recursive_calls, r_bin_r.max_recursion_depth, r_bin_r.elapsed_us);

    printf("[6] DELETE: Removing ISBN %s...\n", extra.isbn);
    st = catalogue_delete(cat, extra.isbn, &m);
    printf("    Status: %s | Removed Index: %d | Shifts: %d | Capacity: %zu -> %zu\n\n",
           catalogue_status_string(st), m.final_index, m.shift_count,
           m.old_capacity, m.new_capacity);

    printf("[7] PERFORMANCE BENCHMARK (Native C CLOCK_MONOTONIC):\n");
    size_t bench_sizes[] = {1000, 5000, 10000, 25000, 50000, 75000, 100000};
    printf("    %-8s | %-18s | %10s | %10s | %10s | %11s\n",
           "Size", "Algorithm", "Best Cmp", "Avg Cmp", "Worst Cmp", "Worst (us)");
    printf("    ----------------------------------------------------------------------------\n");
    for (size_t i = 0; i < sizeof(bench_sizes) / sizeof(bench_sizes[0]); i++) {
        BenchmarkSummary rows[3];
        if (catalogue_benchmark_size(bench_sizes[i], rows) == CAT_OK) {
            for (int a = 0; a < 3; a++) {
                printf("    %-8zu | %-18s | %10ld | %10.1f | %10ld | %11.3f\n",
                       rows[a].dataset_size, rows[a].algorithm,
                       rows[a].best_comparisons, rows[a].avg_comparisons,
                       rows[a].worst_comparisons, rows[a].worst_time_us);
            }
        }
    }

    catalogue_destroy(cat);
    printf("\nMemory cleanly freed via catalogue_destroy().\n");
    return 0;
}

/* Helper to split tab-separated fields in place */
static int split_tabs(char *line, char **fields, int max_fields) {
    int count = 0;
    char *p = line;
    while (count < max_fields) {
        fields[count++] = p;
        char *tab = strchr(p, '\t');
        if (!tab) break;
        *tab = '\0';
        p = tab + 1;
    }
    return count;
}

/* Case-insensitive substring helper for paginated search filter */
static int contains_icase(const char *haystack, const char *needle) {
    if (!needle || needle[0] == '\0') return 1;
    size_t nlen = strlen(needle);
    for (const char *p = haystack; *p; p++) {
        size_t i = 0;
        while (i < nlen && p[i] && tolower((unsigned char)p[i]) == tolower((unsigned char)needle[i])) {
            i++;
        }
        if (i == nlen) return 1;
    }
    return 0;
}

typedef struct {
    size_t index;
    Book book;
} IndexedBook;

static int g_sort_field = 0; /* 0=isbn, 1=title, 2=author, 3=copies */
static int g_sort_dir = 1;   /* 1=asc, -1=desc */

static int compare_indexed_books(const void *a, const void *b) {
    const IndexedBook *ba = (const IndexedBook *)a;
    const IndexedBook *bb = (const IndexedBook *)b;
    int cmp = 0;
    switch (g_sort_field) {
        case 1: cmp = strcmp(ba->book.title, bb->book.title); break;
        case 2: cmp = strcmp(ba->book.author, bb->book.author); break;
        case 3: cmp = (ba->book.copies > bb->book.copies) - (ba->book.copies < bb->book.copies); break;
        default: cmp = strcmp(ba->book.isbn, bb->book.isbn); break;
    }
    if (cmp == 0) cmp = strcmp(ba->book.isbn, bb->book.isbn);
    return cmp * g_sort_dir;
}

static void print_search_result_json(const char *algo, const char *isbn, const SearchResult *r) {
    fputs("{\"ok\":true,\"algorithm\":", stdout);
    print_json_str(algo);
    fputs(",\"queryIsbn\":", stdout);
    print_json_str(isbn);
    printf(",\"found\":%s,\"index\":%d,\"comparisons\":%ld,\"recursiveCalls\":%d,\"maxRecursionDepth\":%d,\"elapsedUs\":%.3f,\"elapsedMs\":%.6f,\"book\":",
           r->found ? "true" : "false",
           r->index,
           r->comparisons,
           r->recursive_calls,
           r->max_recursion_depth,
           r->elapsed_us,
           r->elapsed_us / 1000.0);
    if (r->found) {
        print_book_json(&r->book, r->index);
    } else {
        fputs("null", stdout);
    }
    printf(",\"traceTruncated\":%s,\"steps\":[", r->trace_truncated ? "true" : "false");
    for (int i = 0; i < r->trace_count; i++) {
        const SearchStep *st = &r->steps[i];
        if (i > 0) putchar(',');
        printf("{\"step\":%d,\"index\":%d,\"low\":%d,\"high\":%d,\"mid\":%d,\"depth\":%d,\"cmp\":%d,\"isbn\":",
               st->step_number, st->index, st->low, st->high, st->mid, st->recursion_depth, st->cmp_result);
        print_json_str(st->examined_isbn);
        putchar('}');
    }
    fputs("]}\n", stdout);
}

static void handle_list_command(const Catalogue *cat, char **fields, int nfields) {
    int page = (nfields > 1) ? atoi(fields[1]) : 1;
    int limit = (nfields > 2) ? atoi(fields[2]) : 20;
    const char *sort_by = (nfields > 3) ? fields[3] : "isbn";
    const char *sort_dir = (nfields > 4) ? fields[4] : "asc";
    const char *filter = (nfields > 5) ? fields[5] : "";

    if (page < 1) page = 1;
    if (limit < 1) limit = 20;
    if (limit > 200) limit = 200;

    size_t n = catalogue_size(cat);
    int default_order = (strcmp(sort_by, "isbn") == 0 && strcmp(sort_dir, "asc") == 0 && filter[0] == '\0');

    fputs("{\"ok\":true,\"stats\":", stdout);
    print_stats_json(cat);

    if (default_order) {
        size_t start = (size_t)(page - 1) * (size_t)limit;
        size_t end = start + (size_t)limit;
        if (end > n) end = n;
        printf(",\"totalFiltered\":%zu,\"page\":%d,\"limit\":%d,\"books\":[", n, page, limit);
        Book b;
        int first = 1;
        for (size_t i = start; i < end; i++) {
            if (catalogue_get_at(cat, i, &b) == CAT_OK) {
                if (!first) putchar(',');
                first = 0;
                print_book_json(&b, (int)i);
            }
        }
        fputs("]}\n", stdout);
        return;
    }

    /* Filtered or custom-sorted view using only public ADT accessor */
    IndexedBook *items = (IndexedBook *)malloc((n > 0 ? n : 1) * sizeof(IndexedBook));
    if (!items) {
        fputs(",\"totalFiltered\":0,\"page\":1,\"limit\":20,\"books\":[]}\n", stdout);
        return;
    }

    size_t matched = 0;
    Book b;
    for (size_t i = 0; i < n; i++) {
        if (catalogue_get_at(cat, i, &b) == CAT_OK) {
            if (filter[0] == '\0' ||
                contains_icase(b.isbn, filter) ||
                contains_icase(b.title, filter) ||
                contains_icase(b.author, filter)) {
                items[matched].index = i;
                items[matched].book = b;
                matched++;
            }
        }
    }

    if (strcmp(sort_by, "title") == 0) g_sort_field = 1;
    else if (strcmp(sort_by, "author") == 0) g_sort_field = 2;
    else if (strcmp(sort_by, "copies") == 0) g_sort_field = 3;
    else g_sort_field = 0;
    g_sort_dir = (strcmp(sort_dir, "desc") == 0) ? -1 : 1;

    if (!(g_sort_field == 0 && g_sort_dir == 1) && matched > 1) {
        qsort(items, matched, sizeof(IndexedBook), compare_indexed_books);
    }

    size_t start = (size_t)(page - 1) * (size_t)limit;
    size_t end = start + (size_t)limit;
    if (end > matched) end = matched;

    printf(",\"totalFiltered\":%zu,\"page\":%d,\"limit\":%d,\"books\":[", matched, page, limit);
    for (size_t i = start; i < end; i++) {
        if (i > start) putchar(',');
        print_book_json(&items[i].book, (int)items[i].index);
    }
    fputs("]}\n", stdout);
    free(items);
}

/* Sample array window around search steps for visualizer */
static void handle_sample_window(const Catalogue *cat) {
    size_t n = catalogue_size(cat);
    fputs("{\"ok\":true,\"size\":", stdout);
    printf("%zu,\"items\":[", n);
    Book b;
    /* Return full catalogue if <= 64, otherwise 32 representative indices */
    if (n <= 64) {
        for (size_t i = 0; i < n; i++) {
            if (catalogue_get_at(cat, i, &b) == CAT_OK) {
                if (i > 0) putchar(',');
                print_book_json(&b, (int)i);
            }
        }
    } else {
        for (int k = 0; k < 32; k++) {
            size_t idx = (size_t)k * (n - 1) / 31;
            if (catalogue_get_at(cat, idx, &b) == CAT_OK) {
                if (k > 0) putchar(',');
                print_book_json(&b, (int)idx);
            }
        }
    }
    fputs("]}\n", stdout);
}

/* Persistent Stdin/Stdout Server Mode */
static int run_server_mode(const char *data_file) {
    Catalogue *cat = catalogue_create(32);
    if (!cat) {
        fprintf(stderr, "Failed to initialize Catalogue ADT\n");
        return 1;
    }

    if (data_file && catalogue_load_file(cat, data_file) != CAT_OK) {
        catalogue_load_demo_data(cat);
        catalogue_save_file(cat, data_file);
    } else if (catalogue_size(cat) == 0 && data_file) {
        /* Keep empty if user intentionally deleted all, only seed on missing file */
    }

    /* Emit startup handshake */
    fputs("{\"ready\":true,\"engine\":\"native-c-adt\",\"stats\":", stdout);
    print_stats_json(cat);
    fputs("}\n", stdout);
    fflush(stdout);

    char line[4096];
    while (fgets(line, sizeof(line), stdin)) {
        size_t len = strlen(line);
        while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
            line[--len] = '\0';
        }
        if (len == 0) continue;

        char *fields[12];
        int nfields = split_tabs(line, fields, 12);
        const char *cmd = fields[0];

        if (strcmp(cmd, "STATS") == 0) {
            fputs("{\"ok\":true,\"stats\":", stdout);
            print_stats_json(cat);
            /* Also include best/mid/last sample ISBNs for quick testing */
            Book first_b, mid_b, last_b;
            size_t sz = catalogue_size(cat);
            fputs(",\"quickTargets\":{", stdout);
            if (sz > 0) {
                catalogue_get_at(cat, 0, &first_b);
                catalogue_get_at(cat, (sz - 1) / 2, &mid_b);
                catalogue_get_at(cat, sz - 1, &last_b);
                fputs("\"first\":", stdout); print_json_str(first_b.isbn);
                fputs(",\"mid\":", stdout); print_json_str(mid_b.isbn);
                fputs(",\"last\":", stdout); print_json_str(last_b.isbn);
                fputs(",\"missing\":\"978-9-999999-9\"", stdout);
            } else {
                fputs("\"first\":null,\"mid\":null,\"last\":null,\"missing\":\"978-9-999999-9\"", stdout);
            }
            fputs("}}\n", stdout);
        } else if (strcmp(cmd, "LIST") == 0) {
            handle_list_command(cat, fields, nfields);
        } else if (strcmp(cmd, "WINDOW") == 0) {
            handle_sample_window(cat);
        } else if (strcmp(cmd, "INSERT") == 0 && nfields >= 5) {
            Book b;
            memset(&b, 0, sizeof(Book));
            snprintf(b.isbn, BOOK_ISBN_MAX, "%s", fields[1]);
            snprintf(b.title, BOOK_TITLE_MAX, "%s", fields[2]);
            snprintf(b.author, BOOK_AUTHOR_MAX, "%s", fields[3]);
            b.copies = atoi(fields[4]);
            int pos = (nfields >= 6 && fields[5][0] != '\0') ? atoi(fields[5]) : -1;

            MutationMetrics m;
            memset(&m, 0, sizeof(m));
            CatalogueStatus st = catalogue_insert(cat, &b, pos, &m);
            if (st == CAT_OK) {
                if (data_file) catalogue_save_file(cat, data_file);
                printf("{\"ok\":true,\"metrics\":{\"finalIndex\":%d,\"shiftCount\":%d,\"capacityChanged\":%d,\"oldCapacity\":%zu,\"newCapacity\":%zu,\"elapsedUs\":%.3f},\"stats\":",
                       m.final_index, m.shift_count, m.capacity_changed,
                       m.old_capacity, m.new_capacity, m.elapsed_us);
                print_stats_json(cat);
                fputs("}\n", stdout);
            } else {
                fputs("{\"ok\":false,\"error\":", stdout);
                print_json_str(catalogue_status_string(st));
                printf(",\"code\":%d}\n", (int)st);
            }
        } else if (strcmp(cmd, "DELETE") == 0 && nfields >= 2) {
            MutationMetrics m;
            memset(&m, 0, sizeof(m));
            CatalogueStatus st = catalogue_delete(cat, fields[1], &m);
            if (st == CAT_OK) {
                if (data_file) catalogue_save_file(cat, data_file);
                printf("{\"ok\":true,\"metrics\":{\"finalIndex\":%d,\"shiftCount\":%d,\"capacityChanged\":%d,\"oldCapacity\":%zu,\"newCapacity\":%zu,\"elapsedUs\":%.3f},\"stats\":",
                       m.final_index, m.shift_count, m.capacity_changed,
                       m.old_capacity, m.new_capacity, m.elapsed_us);
                print_stats_json(cat);
                fputs("}\n", stdout);
            } else {
                fputs("{\"ok\":false,\"error\":", stdout);
                print_json_str(catalogue_status_string(st));
                printf(",\"code\":%d}\n", (int)st);
            }
        } else if (strcmp(cmd, "UPDATE") == 0 && nfields >= 3) {
            double elapsed = 0.0;
            CatalogueStatus st = catalogue_update_copies(cat, fields[1], atoi(fields[2]), &elapsed);
            if (st == CAT_OK) {
                if (data_file) catalogue_save_file(cat, data_file);
                printf("{\"ok\":true,\"elapsedUs\":%.3f,\"stats\":", elapsed);
                print_stats_json(cat);
                fputs("}\n", stdout);
            } else {
                fputs("{\"ok\":false,\"error\":", stdout);
                print_json_str(catalogue_status_string(st));
                printf(",\"code\":%d}\n", (int)st);
            }
        } else if (strcmp(cmd, "SEARCH") == 0 && nfields >= 3) {
            const char *algo = fields[1];
            const char *isbn = fields[2];
            int trace = (nfields >= 4) ? atoi(fields[3]) : 1;
            SearchResult res;
            CatalogueStatus st = CAT_ERR_INVALID_INPUT;

            if (strcmp(algo, "linear") == 0) {
                st = catalogue_search_linear(cat, isbn, trace, &res);
            } else if (strcmp(algo, "binary_iterative") == 0) {
                st = catalogue_search_binary_iterative(cat, isbn, trace, &res);
            } else if (strcmp(algo, "binary_recursive") == 0) {
                st = catalogue_search_binary_recursive(cat, isbn, trace, &res);
            }

            if (st == CAT_OK) {
                print_search_result_json(algo, isbn, &res);
            } else {
                fputs("{\"ok\":false,\"error\":", stdout);
                print_json_str(catalogue_status_string(st));
                fputs("}\n", stdout);
            }
        } else if (strcmp(cmd, "RESET_DEMO") == 0) {
            CatalogueStatus st = catalogue_load_demo_data(cat);
            if (st == CAT_OK) {
                if (data_file) catalogue_save_file(cat, data_file);
                fputs("{\"ok\":true,\"stats\":", stdout);
                print_stats_json(cat);
                fputs("}\n", stdout);
            } else {
                fputs("{\"ok\":false,\"error\":\"Failed to reset demo data\"}\n", stdout);
            }
        } else if (strcmp(cmd, "GENERATE") == 0 && nfields >= 2) {
            size_t count = (size_t)strtoul(fields[1], NULL, 10);
            CatalogueStatus st = catalogue_generate_dataset(cat, count);
            if (st == CAT_OK) {
                if (data_file) catalogue_save_file(cat, data_file);
                fputs("{\"ok\":true,\"stats\":", stdout);
                print_stats_json(cat);
                fputs("}\n", stdout);
            } else {
                fputs("{\"ok\":false,\"error\":", stdout);
                print_json_str(catalogue_status_string(st));
                fputs("}\n", stdout);
            }
        } else if (strcmp(cmd, "BENCHMARK") == 0 && nfields >= 2) {
            /* Comma-separated list of dataset sizes */
            fputs("{\"ok\":true,\"results\":[", stdout);
            char *sizes_str = fields[1];
            char *tok = strtok(sizes_str, ",");
            int first_row = 1;
            while (tok) {
                size_t sz = (size_t)strtoul(tok, NULL, 10);
                if (sz >= 100 && sz <= 100000) {
                    BenchmarkSummary rows[3];
                    if (catalogue_benchmark_size(sz, rows) == CAT_OK) {
                        for (int a = 0; a < 3; a++) {
                            if (!first_row) putchar(',');
                            first_row = 0;
                            printf("{\"size\":%zu,\"algorithm\":", rows[a].dataset_size);
                            print_json_str(rows[a].algorithm);
                            printf(",\"best\":{\"trials\":%d,\"comparisons\":%ld,\"timeUs\":%.4f,\"recursiveCalls\":%d,\"stackDepth\":%d},"
                                   "\"average\":{\"trials\":%d,\"comparisons\":%.2f,\"timeUs\":%.4f,\"recursiveCalls\":%.2f,\"stackDepth\":%.2f},"
                                   "\"worst\":{\"trials\":%d,\"comparisons\":%ld,\"timeUs\":%.4f,\"recursiveCalls\":%d,\"stackDepth\":%d}}",
                                   rows[a].best_trials, rows[a].best_comparisons, rows[a].best_time_us,
                                   rows[a].best_rec_calls, rows[a].best_stack_depth,
                                   rows[a].avg_trials, rows[a].avg_comparisons, rows[a].avg_time_us,
                                   rows[a].avg_rec_calls, rows[a].avg_stack_depth,
                                   rows[a].worst_trials, rows[a].worst_comparisons, rows[a].worst_time_us,
                                   rows[a].worst_rec_calls, rows[a].worst_stack_depth);
                        }
                    }
                }
                tok = strtok(NULL, ",");
            }
            fputs("]}\n", stdout);
        } else if (strcmp(cmd, "QUIT") == 0) {
            fputs("{\"ok\":true,\"bye\":true}\n", stdout);
            fflush(stdout);
            break;
        } else {
            fputs("{\"ok\":false,\"error\":\"Unknown command\"}\n", stdout);
        }
        fflush(stdout);
    }

    catalogue_destroy(cat);
    return 0;
}

int main(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "--server") == 0) {
        const char *data_file = (argc >= 3) ? argv[2] : NULL;
        return run_server_mode(data_file);
    }
    return run_cli_demo();
}
