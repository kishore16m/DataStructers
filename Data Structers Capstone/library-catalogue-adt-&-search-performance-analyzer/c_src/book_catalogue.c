#define _POSIX_C_SOURCE 200809L

#include "book_catalogue.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/*
 * ============================================================================
 * LIBRARY CATALOGUE ADT — Private Implementation (book_catalogue.c)
 * ============================================================================
 * Encapsulates the dynamically allocated sorted array of Book records.
 * Performs real malloc/realloc/memmove memory management, exact key comparison
 * counting, recursive call/stack tracking, and CLOCK_MONOTONIC benchmarking.
 * ============================================================================
 */

struct Catalogue {
    Book *books;
    size_t size;
    size_t capacity;
};

/* High-resolution monotonic clock helper (returns microseconds) */
static double now_microseconds(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1e6 + (double)ts.tv_nsec / 1e3;
}

static int is_valid_text(const char *s, size_t max_len) {
    if (!s || s[0] == '\0') return 0;
    size_t len = strlen(s);
    if (len == 0 || len >= max_len) return 0;
    int has_visible = 0;
    for (size_t i = 0; i < len; i++) {
        unsigned char c = (unsigned char)s[i];
        if (c == '\t' || c == '\n' || c == '\r') return 0;
        if (isprint(c) && !isspace(c)) has_visible = 1;
    }
    return has_visible;
}

static void record_step(
    SearchResult *res,
    int index,
    int low,
    int high,
    int mid,
    int depth,
    int cmp_result,
    const char *isbn
) {
    if (!res) return;
    if (res->trace_count < MAX_TRACE_STEPS) {
        SearchStep *st = &res->steps[res->trace_count];
        st->step_number = res->trace_count + 1;
        st->index = index;
        st->low = low;
        st->high = high;
        st->mid = mid;
        st->recursion_depth = depth;
        st->cmp_result = cmp_result;
        snprintf(st->examined_isbn, BOOK_ISBN_MAX, "%s", isbn ? isbn : "");
        res->trace_count++;
    } else {
        res->trace_truncated = 1;
    }
}

/* Internal binary search helper returning exact index or lower_bound insertion index */
static size_t find_lower_bound(const Catalogue *cat, const char *isbn, int *exact_match) {
    size_t low = 0;
    size_t high = cat->size;
    if (exact_match) *exact_match = 0;

    while (low < high) {
        size_t mid = low + (high - low) / 2;
        int cmp = strcmp(cat->books[mid].isbn, isbn);
        if (cmp < 0) {
            low = mid + 1;
        } else {
            if (cmp == 0 && exact_match) *exact_match = 1;
            high = mid;
        }
    }
    if (low < cat->size && strcmp(cat->books[low].isbn, isbn) == 0) {
        if (exact_match) *exact_match = 1;
    }
    return low;
}

/* --- Lifecycle Management --- */

Catalogue *catalogue_create(size_t initial_capacity) {
    if (initial_capacity < CAT_MIN_CAPACITY) {
        initial_capacity = CAT_MIN_CAPACITY;
    }
    Catalogue *cat = (Catalogue *)malloc(sizeof(Catalogue));
    if (!cat) return NULL;

    cat->books = (Book *)calloc(initial_capacity, sizeof(Book));
    if (!cat->books) {
        free(cat);
        return NULL;
    }
    cat->size = 0;
    cat->capacity = initial_capacity;
    return cat;
}

void catalogue_destroy(Catalogue *cat) {
    if (!cat) return;
    free(cat->books);
    cat->books = NULL;
    cat->size = 0;
    cat->capacity = 0;
    free(cat);
}

/* --- Encapsulated Accessors --- */

size_t catalogue_size(const Catalogue *cat) {
    return cat ? cat->size : 0;
}

size_t catalogue_capacity(const Catalogue *cat) {
    return cat ? cat->capacity : 0;
}

long catalogue_total_copies(const Catalogue *cat) {
    if (!cat) return 0;
    long total = 0;
    for (size_t i = 0; i < cat->size; i++) {
        total += cat->books[i].copies;
    }
    return total;
}

size_t catalogue_memory_bytes(const Catalogue *cat) {
    if (!cat) return 0;
    return sizeof(Catalogue) + cat->capacity * sizeof(Book);
}

CatalogueStatus catalogue_get_at(const Catalogue *cat, size_t index, Book *out_book) {
    if (!cat || !out_book) return CAT_ERR_NULL_PTR;
    if (index >= cat->size) return CAT_ERR_INVALID_POSITION;
    *out_book = cat->books[index];
    return CAT_OK;
}

/* --- Core ADT Operations --- */

CatalogueStatus catalogue_insert(
    Catalogue *cat,
    const Book *book,
    int target_position,
    MutationMetrics *metrics
) {
    if (!cat || !book) return CAT_ERR_NULL_PTR;
    if (!is_valid_text(book->isbn, BOOK_ISBN_MAX) ||
        !is_valid_text(book->title, BOOK_TITLE_MAX) ||
        !is_valid_text(book->author, BOOK_AUTHOR_MAX) ||
        book->copies < 0 || book->copies > 100000) {
        return CAT_ERR_INVALID_INPUT;
    }

    double t0 = now_microseconds();
    size_t old_cap = cat->capacity;
    int resized = 0;

    int exists = 0;
    size_t sorted_pos = find_lower_bound(cat, book->isbn, &exists);
    if (exists) {
        return CAT_ERR_DUPLICATE_ISBN;
    }

    size_t insert_pos = sorted_pos;
    if (target_position >= 0) {
        if ((size_t)target_position > cat->size) {
            return CAT_ERR_INVALID_POSITION;
        }
        /* Verify ascending ISBN order is preserved at requested position */
        if (target_position > 0 &&
            strcmp(cat->books[target_position - 1].isbn, book->isbn) >= 0) {
            return CAT_ERR_ORDER_VIOLATION;
        }
        if ((size_t)target_position < cat->size &&
            strcmp(book->isbn, cat->books[target_position].isbn) >= 0) {
            return CAT_ERR_ORDER_VIOLATION;
        }
        insert_pos = (size_t)target_position;
    }

    /* Grow capacity dynamically (2x doubling strategy) when full */
    if (cat->size >= cat->capacity) {
        size_t new_cap = cat->capacity < CAT_MIN_CAPACITY ? CAT_MIN_CAPACITY : cat->capacity * 2;
        Book *new_block = (Book *)realloc(cat->books, new_cap * sizeof(Book));
        if (!new_block) return CAT_ERR_MEMORY;
        cat->books = new_block;
        cat->capacity = new_cap;
        resized = 1;
    }

    /* Shift subsequent elements right to open insert_pos */
    size_t shifts = cat->size - insert_pos;
    if (shifts > 0) {
        memmove(
            &cat->books[insert_pos + 1],
            &cat->books[insert_pos],
            shifts * sizeof(Book)
        );
    }

    /* Copy sanitized record into slot */
    Book *dst = &cat->books[insert_pos];
    memset(dst, 0, sizeof(Book));
    snprintf(dst->isbn, BOOK_ISBN_MAX, "%s", book->isbn);
    snprintf(dst->title, BOOK_TITLE_MAX, "%s", book->title);
    snprintf(dst->author, BOOK_AUTHOR_MAX, "%s", book->author);
    dst->copies = book->copies;
    cat->size++;

    double t1 = now_microseconds();
    if (metrics) {
        metrics->final_index = (int)insert_pos;
        metrics->shift_count = (int)shifts;
        metrics->capacity_changed = resized;
        metrics->old_capacity = old_cap;
        metrics->new_capacity = cat->capacity;
        metrics->elapsed_us = t1 - t0;
    }
    return CAT_OK;
}

CatalogueStatus catalogue_delete(
    Catalogue *cat,
    const char *isbn,
    MutationMetrics *metrics
) {
    if (!cat || !isbn) return CAT_ERR_NULL_PTR;
    if (!is_valid_text(isbn, BOOK_ISBN_MAX)) return CAT_ERR_INVALID_INPUT;

    double t0 = now_microseconds();
    size_t old_cap = cat->capacity;
    int shrunk = 0;

    int exists = 0;
    size_t idx = find_lower_bound(cat, isbn, &exists);
    if (!exists) {
        return CAT_ERR_NOT_FOUND;
    }

    /* Shift subsequent elements left to close the gap */
    size_t shifts = cat->size - 1 - idx;
    if (shifts > 0) {
        memmove(
            &cat->books[idx],
            &cat->books[idx + 1],
            shifts * sizeof(Book)
        );
    }
    cat->size--;

    /* Shrink capacity by half when utilization drops to <= 25% */
    if (cat->capacity > CAT_MIN_CAPACITY && cat->size <= cat->capacity / 4) {
        size_t new_cap = cat->capacity / 2;
        if (new_cap < CAT_MIN_CAPACITY) new_cap = CAT_MIN_CAPACITY;
        Book *new_block = (Book *)realloc(cat->books, new_cap * sizeof(Book));
        if (new_block) {
            cat->books = new_block;
            cat->capacity = new_cap;
            shrunk = -1;
        }
    }

    double t1 = now_microseconds();
    if (metrics) {
        metrics->final_index = (int)idx;
        metrics->shift_count = (int)shifts;
        metrics->capacity_changed = shrunk;
        metrics->old_capacity = old_cap;
        metrics->new_capacity = cat->capacity;
        metrics->elapsed_us = t1 - t0;
    }
    return CAT_OK;
}

CatalogueStatus catalogue_update_copies(
    Catalogue *cat,
    const char *isbn,
    int new_copies,
    double *elapsed_us
) {
    if (!cat || !isbn) return CAT_ERR_NULL_PTR;
    if (!is_valid_text(isbn, BOOK_ISBN_MAX) || new_copies < 0 || new_copies > 100000) {
        return CAT_ERR_INVALID_INPUT;
    }

    double t0 = now_microseconds();
    int exists = 0;
    size_t idx = find_lower_bound(cat, isbn, &exists);
    if (!exists) {
        return CAT_ERR_NOT_FOUND;
    }

    cat->books[idx].copies = new_copies;
    double t1 = now_microseconds();
    if (elapsed_us) *elapsed_us = t1 - t0;
    return CAT_OK;
}

CatalogueStatus catalogue_traverse(
    const Catalogue *cat,
    CatalogueVisitor visitor,
    void *user_data
) {
    if (!cat || !visitor) return CAT_ERR_NULL_PTR;
    for (size_t i = 0; i < cat->size; i++) {
        visitor(i, &cat->books[i], user_data);
    }
    return CAT_OK;
}

/* --- Searching Algorithms --- */

CatalogueStatus catalogue_search_linear(
    const Catalogue *cat,
    const char *isbn,
    int capture_trace,
    SearchResult *result
) {
    if (!cat || !isbn || !result) return CAT_ERR_NULL_PTR;
    if (!is_valid_text(isbn, BOOK_ISBN_MAX)) return CAT_ERR_INVALID_INPUT;

    memset(result, 0, sizeof(SearchResult));
    result->index = -1;

    double t0 = now_microseconds();
    for (size_t i = 0; i < cat->size; i++) {
        int cmp = strcmp(cat->books[i].isbn, isbn);
        result->comparisons++;
        if (capture_trace) {
            record_step(result, (int)i, 0, (int)cat->size - 1, (int)i, 0, cmp, cat->books[i].isbn);
        }
        if (cmp == 0) {
            result->found = 1;
            result->index = (int)i;
            result->book = cat->books[i];
            break;
        }
    }
    double t1 = now_microseconds();
    result->elapsed_us = t1 - t0;
    return CAT_OK;
}

CatalogueStatus catalogue_search_binary_iterative(
    const Catalogue *cat,
    const char *isbn,
    int capture_trace,
    SearchResult *result
) {
    if (!cat || !isbn || !result) return CAT_ERR_NULL_PTR;
    if (!is_valid_text(isbn, BOOK_ISBN_MAX)) return CAT_ERR_INVALID_INPUT;

    memset(result, 0, sizeof(SearchResult));
    result->index = -1;

    double t0 = now_microseconds();
    long low = 0;
    long high = (long)cat->size - 1;

    while (low <= high) {
        long mid = low + (high - low) / 2;
        int cmp = strcmp(cat->books[mid].isbn, isbn);
        result->comparisons++;
        if (capture_trace) {
            record_step(result, (int)mid, (int)low, (int)high, (int)mid, 0, cmp, cat->books[mid].isbn);
        }
        if (cmp == 0) {
            result->found = 1;
            result->index = (int)mid;
            result->book = cat->books[mid];
            break;
        } else if (cmp < 0) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    double t1 = now_microseconds();
    result->elapsed_us = t1 - t0;
    return CAT_OK;
}

static void binary_search_recursive_helper(
    const Catalogue *cat,
    const char *isbn,
    long low,
    long high,
    int depth,
    int capture_trace,
    SearchResult *result
) {
    result->recursive_calls++;
    if (depth > result->max_recursion_depth) {
        result->max_recursion_depth = depth;
    }

    if (low > high) {
        return;
    }

    long mid = low + (high - low) / 2;
    int cmp = strcmp(cat->books[mid].isbn, isbn);
    result->comparisons++;
    if (capture_trace) {
        record_step(result, (int)mid, (int)low, (int)high, (int)mid, depth, cmp, cat->books[mid].isbn);
    }

    if (cmp == 0) {
        result->found = 1;
        result->index = (int)mid;
        result->book = cat->books[mid];
        return;
    } else if (cmp < 0) {
        binary_search_recursive_helper(cat, isbn, mid + 1, high, depth + 1, capture_trace, result);
    } else {
        binary_search_recursive_helper(cat, isbn, low, mid - 1, depth + 1, capture_trace, result);
    }
}

CatalogueStatus catalogue_search_binary_recursive(
    const Catalogue *cat,
    const char *isbn,
    int capture_trace,
    SearchResult *result
) {
    if (!cat || !isbn || !result) return CAT_ERR_NULL_PTR;
    if (!is_valid_text(isbn, BOOK_ISBN_MAX)) return CAT_ERR_INVALID_INPUT;

    memset(result, 0, sizeof(SearchResult));
    result->index = -1;

    double t0 = now_microseconds();
    if (cat->size > 0) {
        binary_search_recursive_helper(cat, isbn, 0, (long)cat->size - 1, 1, capture_trace, result);
    }
    double t1 = now_microseconds();
    result->elapsed_us = t1 - t0;
    return CAT_OK;
}

/* --- Demo Data & Large Dataset Generator --- */

static const Book DEMO_BOOKS[] = {
    {"978-0-07-013151-4", "Introduction to Algorithms (2nd Ed.)", "Thomas H. Cormen", 7},
    {"978-0-07-352332-3", "Database System Concepts", "Abraham Silberschatz", 9},
    {"978-0-13-110362-7", "The C Programming Language", "Brian W. Kernighan & Dennis M. Ritchie", 14},
    {"978-0-13-235088-4", "Clean Code: A Handbook of Agile Software", "Robert C. Martin", 11},
    {"978-0-13-409266-9", "Computer Systems: A Programmer's Perspective", "Randal E. Bryant & David R. O'Hallaron", 6},
    {"978-0-13-468599-1", "Effective Java (3rd Edition)", "Joshua Bloch", 8},
    {"978-0-13-604259-4", "Artificial Intelligence: A Modern Approach", "Stuart Russell & Peter Norvig", 10},
    {"978-0-201-63361-0", "Design Patterns: Reusable Object-Oriented Software", "Erich Gamma et al.", 5},
    {"978-0-201-89683-1", "The Art of Computer Programming, Vol. 1", "Donald E. Knuth", 4},
    {"978-0-201-89684-8", "The Art of Computer Programming, Vol. 2", "Donald E. Knuth", 3},
    {"978-0-201-89685-5", "The Art of Computer Programming, Vol. 3", "Donald E. Knuth", 5},
    {"978-0-262-03384-8", "Introduction to Algorithms (3rd Ed.)", "Cormen, Leiserson, Rivest & Stein", 16},
    {"978-0-262-51087-5", "Structure and Interpretation of Computer Programs", "Harold Abelson & Gerald Jay Sussman", 7},
    {"978-0-321-12521-7", "Domain-Driven Design", "Eric Evans", 4},
    {"978-0-321-57351-3", "Algorithms (4th Edition)", "Robert Sedgewick & Kevin Wayne", 12},
    {"978-0-596-00712-6", "Head First Design Patterns", "Eric Freeman & Elisabeth Robson", 9},
    {"978-0-596-51774-8", "JavaScript: The Good Parts", "Douglas Crockford", 6},
    {"978-1-118-06333-0", "Operating System Concepts (9th Ed.)", "Abraham Silberschatz & Peter B. Galvin", 13},
    {"978-1-449-37332-0", "Designing Data-Intensive Applications", "Martin Kleppmann", 15},
    {"978-1-491-95035-7", "Building Microservices", "Sam Newman", 6},
    {"978-1-593-27950-9", "Eloquent JavaScript (3rd Edition)", "Marijn Haverbeke", 8},
    {"978-1-718-50045-7", "The Rust Programming Language", "Steve Klabnik & Carol Nichols", 7},
    {"978-1-848-00069-8", "The Algorithm Design Manual", "Steven S. Skiena", 10},
    {"978-1-937-78549-9", "Seven Databases in Seven Weeks", "Eric Redmond & Jim R. Wilson", 5}
};

CatalogueStatus catalogue_load_demo_data(Catalogue *cat) {
    if (!cat) return CAT_ERR_NULL_PTR;

    /* Reset array capacity cleanly */
    Book *fresh = (Book *)calloc(32, sizeof(Book));
    if (!fresh) return CAT_ERR_MEMORY;
    free(cat->books);
    cat->books = fresh;
    cat->size = 0;
    cat->capacity = 32;

    size_t count = sizeof(DEMO_BOOKS) / sizeof(DEMO_BOOKS[0]);
    for (size_t i = 0; i < count; i++) {
        CatalogueStatus st = catalogue_insert(cat, &DEMO_BOOKS[i], -1, NULL);
        if (st != CAT_OK) return st;
    }
    return CAT_OK;
}

static const char *SUBJECT_PREFIXES[] = {
    "Foundations of", "Advanced", "Modern", "Applied", "Principles of",
    "Introduction to", "Computational", "Distributed", "Discrete", "Theoretical",
    "Practical", "Quantitative", "Algorithmic", "Systems", "Architectural", "Analytical"
};

static const char *SUBJECT_TOPICS[] = {
    "Data Structures", "Computer Architecture", "Operating Systems", "Compiler Design",
    "Database Internals", "Graph Algorithms", "Network Security", "Machine Learning",
    "Automata Theory", "Software Engineering", "Linear Algebra", "Cryptography",
    "Embedded Systems", "Parallel Computing", "Information Retrieval", "Numerical Analysis",
    "Cloud Infrastructure", "Digital Signal Processing", "Formal Verification", "Artificial Intelligence"
};

static const char *AUTHOR_FIRST[] = {
    "Alan", "Grace", "Donald", "Barbara", "Leslie", "Ken", "Dennis", "Brian",
    "Ada", "Edsger", "Niklaus", "Tony", "John", "Margaret", "Tim", "Linus",
    "Radia", "Vint", "Shafi", "Robert"
};

static const char *AUTHOR_LAST[] = {
    "Turing", "Hopper", "Knuth", "Liskov", "Lamport", "Thompson", "Ritchie", "Kernighan",
    "Lovelace", "Dijkstra", "Wirth", "Hoare", "Backus", "Hamilton", "Berners-Lee", "Torvalds",
    "Perlman", "Cerf", "Goldwasser", "Tarjan"
};

CatalogueStatus catalogue_generate_dataset(Catalogue *cat, size_t count) {
    if (!cat) return CAT_ERR_NULL_PTR;
    if (count == 0 || count > 100000) return CAT_ERR_INVALID_INPUT;

    size_t target_cap = CAT_MIN_CAPACITY;
    while (target_cap < count) {
        target_cap *= 2;
    }

    Book *fresh = (Book *)malloc(target_cap * sizeof(Book));
    if (!fresh) return CAT_ERR_MEMORY;

    free(cat->books);
    cat->books = fresh;
    cat->capacity = target_cap;
    cat->size = count;

    size_t n_pref = sizeof(SUBJECT_PREFIXES) / sizeof(SUBJECT_PREFIXES[0]);
    size_t n_topic = sizeof(SUBJECT_TOPICS) / sizeof(SUBJECT_TOPICS[0]);
    size_t n_first = sizeof(AUTHOR_FIRST) / sizeof(AUTHOR_FIRST[0]);
    size_t n_last = sizeof(AUTHOR_LAST) / sizeof(AUTHOR_LAST[0]);

    /*
     * Generate strictly ascending unique ISBN-13 identifiers:
     * 978-1-000001-X .. 978-1-100000-X
     * Because the middle 6 digits are zero-padded and monotonically increasing,
     * lexicographical strcmp order is strictly ascending by construction.
     */
    for (size_t i = 0; i < count; i++) {
        Book *b = &cat->books[i];
        unsigned long seq = (unsigned long)(i + 1);
        int check_digit = (int)((seq * 7 + 3) % 10);
        snprintf(b->isbn, BOOK_ISBN_MAX, "978-1-%06lu-%d", seq, check_digit);

        const char *pref = SUBJECT_PREFIXES[(i * 7 + 3) % n_pref];
        const char *topic = SUBJECT_TOPICS[(i * 13 + 5) % n_topic];
        int edition = (int)((i % 6) + 1);
        snprintf(b->title, BOOK_TITLE_MAX, "%s %s (Vol. %lu, Ed. %d)",
                 pref, topic, (unsigned long)((i / (n_pref * n_topic)) + 1), edition);

        const char *af = AUTHOR_FIRST[(i * 11 + 1) % n_first];
        const char *al = AUTHOR_LAST[(i * 17 + 7) % n_last];
        snprintf(b->author, BOOK_AUTHOR_MAX, "%s %s", af, al);

        b->copies = (int)((i * 5 + 3) % 18) + 1;
    }

    return CAT_OK;
}

/* --- File Persistence (TSV) --- */

CatalogueStatus catalogue_save_file(const Catalogue *cat, const char *filepath) {
    if (!cat || !filepath) return CAT_ERR_NULL_PTR;

    FILE *fp = fopen(filepath, "w");
    if (!fp) return CAT_ERR_IO;

    for (size_t i = 0; i < cat->size; i++) {
        const Book *b = &cat->books[i];
        fprintf(fp, "%s\t%s\t%s\t%d\n", b->isbn, b->title, b->author, b->copies);
    }

    if (fclose(fp) != 0) return CAT_ERR_IO;
    return CAT_OK;
}

CatalogueStatus catalogue_load_file(Catalogue *cat, const char *filepath) {
    if (!cat || !filepath) return CAT_ERR_NULL_PTR;

    FILE *fp = fopen(filepath, "r");
    if (!fp) return CAT_ERR_IO;

    /* Count lines first to allocate cleanly */
    size_t line_count = 0;
    char line[512];
    while (fgets(line, sizeof(line), fp)) {
        if (line[0] != '\n' && line[0] != '\0') line_count++;
    }
    rewind(fp);

    size_t cap = CAT_MIN_CAPACITY;
    while (cap < line_count) cap *= 2;

    Book *fresh = (Book *)calloc(cap, sizeof(Book));
    if (!fresh) {
        fclose(fp);
        return CAT_ERR_MEMORY;
    }
    free(cat->books);
    cat->books = fresh;
    cat->size = 0;
    cat->capacity = cap;

    while (fgets(line, sizeof(line), fp)) {
        size_t len = strlen(line);
        while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
            line[--len] = '\0';
        }
        if (len == 0) continue;

        char *t1 = strchr(line, '\t');
        if (!t1) continue;
        *t1 = '\0';
        char *t2 = strchr(t1 + 1, '\t');
        if (!t2) continue;
        *t2 = '\0';
        char *t3 = strchr(t2 + 1, '\t');
        if (!t3) continue;
        *t3 = '\0';

        Book b;
        memset(&b, 0, sizeof(Book));
        snprintf(b.isbn, BOOK_ISBN_MAX, "%s", line);
        snprintf(b.title, BOOK_TITLE_MAX, "%s", t1 + 1);
        snprintf(b.author, BOOK_AUTHOR_MAX, "%s", t2 + 1);
        b.copies = atoi(t3 + 1);
        if (b.copies < 0) b.copies = 0;

        /* Fast append if strictly sorted (file is saved sorted), else sorted insert */
        if (cat->size == 0 || strcmp(cat->books[cat->size - 1].isbn, b.isbn) < 0) {
            if (cat->size >= cat->capacity) {
                size_t new_cap = cat->capacity * 2;
                Book *nb = (Book *)realloc(cat->books, new_cap * sizeof(Book));
                if (!nb) {
                    fclose(fp);
                    return CAT_ERR_MEMORY;
                }
                cat->books = nb;
                cat->capacity = new_cap;
            }
            cat->books[cat->size++] = b;
        } else {
            catalogue_insert(cat, &b, -1, NULL);
        }
    }

    fclose(fp);
    return CAT_OK;
}

/* --- Multi-Trial Real Benchmarking Engine --- */

/* Prevent compiler from optimizing away repeated benchmark search calls */
static volatile long g_benchmark_sink = 0;

CatalogueStatus catalogue_benchmark_size(
    size_t dataset_size,
    BenchmarkSummary out_summaries[3]
) {
    if (!out_summaries || dataset_size == 0 || dataset_size > 100000) {
        return CAT_ERR_INVALID_INPUT;
    }

    Catalogue *cat = catalogue_create(dataset_size);
    if (!cat) return CAT_ERR_MEMORY;

    CatalogueStatus st = catalogue_generate_dataset(cat, dataset_size);
    if (st != CAT_OK) {
        catalogue_destroy(cat);
        return st;
    }

    /* Identical target ISBNs for fair comparison */
    const char *linear_best_isbn = cat->books[0].isbn;
    const char *binary_best_isbn = cat->books[(dataset_size - 1) / 2].isbn;
    const char *missing_isbn = "978-9-999999-9";

    /* 20 evenly distributed representative ISBNs for average case */
    const int AVG_SAMPLES = 20;
    const char *avg_targets[20];
    for (int i = 0; i < AVG_SAMPLES; i++) {
        size_t idx = (size_t)i * dataset_size / (size_t)AVG_SAMPLES + dataset_size / (size_t)(AVG_SAMPLES * 2);
        if (idx >= dataset_size) idx = dataset_size - 1;
        avg_targets[i] = cat->books[idx].isbn;
    }

    /* Choose trial counts large enough for stable sub-microsecond precision
       while keeping full 100k suite under ~1 second */
    int linear_trials = (dataset_size <= 5000) ? 100 : (dataset_size <= 25000 ? 40 : 16);
    int binary_trials = 2000;

    memset(out_summaries, 0, sizeof(BenchmarkSummary) * 3);
    out_summaries[0].dataset_size = dataset_size;
    out_summaries[0].algorithm = "linear";
    out_summaries[1].dataset_size = dataset_size;
    out_summaries[1].algorithm = "binary_iterative";
    out_summaries[2].dataset_size = dataset_size;
    out_summaries[2].algorithm = "binary_recursive";

    SearchResult r;

    /* ========== 1. LINEAR SEARCH ========== */
    {
        BenchmarkSummary *s = &out_summaries[0];

        /* Best Case: first element */
        s->best_trials = binary_trials;
        double t0 = now_microseconds();
        for (int t = 0; t < s->best_trials; t++) {
            catalogue_search_linear(cat, linear_best_isbn, 0, &r);
            g_benchmark_sink += r.comparisons;
        }
        double t1 = now_microseconds();
        s->best_time_us = (t1 - t0) / (double)s->best_trials;
        s->best_comparisons = r.comparisons;

        /* Average Case: 20 evenly distributed targets * outer reps */
        int reps = (dataset_size <= 10000) ? 4 : 2;
        s->avg_trials = AVG_SAMPLES * reps;
        long total_cmp = 0;
        t0 = now_microseconds();
        for (int rep = 0; rep < reps; rep++) {
            for (int i = 0; i < AVG_SAMPLES; i++) {
                catalogue_search_linear(cat, avg_targets[i], 0, &r);
                total_cmp += r.comparisons;
                g_benchmark_sink += r.index;
            }
        }
        t1 = now_microseconds();
        s->avg_time_us = (t1 - t0) / (double)s->avg_trials;
        s->avg_comparisons = (double)total_cmp / (double)s->avg_trials;

        /* Worst Case: missing ISBN (examines all N records) */
        s->worst_trials = linear_trials;
        t0 = now_microseconds();
        for (int t = 0; t < s->worst_trials; t++) {
            catalogue_search_linear(cat, missing_isbn, 0, &r);
            g_benchmark_sink += r.comparisons;
        }
        t1 = now_microseconds();
        s->worst_time_us = (t1 - t0) / (double)s->worst_trials;
        s->worst_comparisons = r.comparisons;
    }

    /* ========== 2. ITERATIVE BINARY SEARCH ========== */
    {
        BenchmarkSummary *s = &out_summaries[1];

        /* Best Case: initial midpoint */
        s->best_trials = binary_trials;
        double t0 = now_microseconds();
        for (int t = 0; t < s->best_trials; t++) {
            catalogue_search_binary_iterative(cat, binary_best_isbn, 0, &r);
            g_benchmark_sink += r.comparisons;
        }
        double t1 = now_microseconds();
        s->best_time_us = (t1 - t0) / (double)s->best_trials;
        s->best_comparisons = r.comparisons;

        /* Average Case: 20 representative ISBNs * 100 reps */
        int reps = 100;
        s->avg_trials = AVG_SAMPLES * reps;
        long total_cmp = 0;
        t0 = now_microseconds();
        for (int rep = 0; rep < reps; rep++) {
            for (int i = 0; i < AVG_SAMPLES; i++) {
                catalogue_search_binary_iterative(cat, avg_targets[i], 0, &r);
                total_cmp += r.comparisons;
                g_benchmark_sink += r.index;
            }
        }
        t1 = now_microseconds();
        s->avg_time_us = (t1 - t0) / (double)s->avg_trials;
        s->avg_comparisons = (double)total_cmp / (double)s->avg_trials;

        /* Worst Case: missing ISBN */
        s->worst_trials = binary_trials;
        t0 = now_microseconds();
        for (int t = 0; t < s->worst_trials; t++) {
            catalogue_search_binary_iterative(cat, missing_isbn, 0, &r);
            g_benchmark_sink += r.comparisons;
        }
        t1 = now_microseconds();
        s->worst_time_us = (t1 - t0) / (double)s->worst_trials;
        s->worst_comparisons = r.comparisons;
    }

    /* ========== 3. RECURSIVE BINARY SEARCH ========== */
    {
        BenchmarkSummary *s = &out_summaries[2];

        /* Best Case: initial midpoint */
        s->best_trials = binary_trials;
        double t0 = now_microseconds();
        for (int t = 0; t < s->best_trials; t++) {
            catalogue_search_binary_recursive(cat, binary_best_isbn, 0, &r);
            g_benchmark_sink += r.comparisons;
        }
        double t1 = now_microseconds();
        s->best_time_us = (t1 - t0) / (double)s->best_trials;
        s->best_comparisons = r.comparisons;
        s->best_rec_calls = r.recursive_calls;
        s->best_stack_depth = r.max_recursion_depth;

        /* Average Case: 20 representative ISBNs * 100 reps */
        int reps = 100;
        s->avg_trials = AVG_SAMPLES * reps;
        long total_cmp = 0;
        long total_calls = 0;
        long total_depth = 0;
        t0 = now_microseconds();
        for (int rep = 0; rep < reps; rep++) {
            for (int i = 0; i < AVG_SAMPLES; i++) {
                catalogue_search_binary_recursive(cat, avg_targets[i], 0, &r);
                total_cmp += r.comparisons;
                total_calls += r.recursive_calls;
                total_depth += r.max_recursion_depth;
                g_benchmark_sink += r.index;
            }
        }
        t1 = now_microseconds();
        s->avg_time_us = (t1 - t0) / (double)s->avg_trials;
        s->avg_comparisons = (double)total_cmp / (double)s->avg_trials;
        s->avg_rec_calls = (double)total_calls / (double)s->avg_trials;
        s->avg_stack_depth = (double)total_depth / (double)s->avg_trials;

        /* Worst Case: missing ISBN */
        s->worst_trials = binary_trials;
        t0 = now_microseconds();
        for (int t = 0; t < s->worst_trials; t++) {
            catalogue_search_binary_recursive(cat, missing_isbn, 0, &r);
            g_benchmark_sink += r.comparisons;
        }
        t1 = now_microseconds();
        s->worst_time_us = (t1 - t0) / (double)s->worst_trials;
        s->worst_comparisons = r.comparisons;
        s->worst_rec_calls = r.recursive_calls;
        s->worst_stack_depth = r.max_recursion_depth;
    }

    catalogue_destroy(cat);
    return CAT_OK;
}

const char *catalogue_status_string(CatalogueStatus status) {
    switch (status) {
        case CAT_OK:                   return "OK";
        case CAT_ERR_NULL_PTR:         return "Internal null pointer error";
        case CAT_ERR_MEMORY:           return "Memory allocation failed";
        case CAT_ERR_DUPLICATE_ISBN:   return "Duplicate ISBN already exists in catalogue";
        case CAT_ERR_NOT_FOUND:        return "Book with specified ISBN was not found";
        case CAT_ERR_INVALID_INPUT:    return "Invalid book fields or copy count";
        case CAT_ERR_INVALID_POSITION: return "Specified insertion position is out of range";
        case CAT_ERR_ORDER_VIOLATION:  return "Specified position violates ascending ISBN order";
        case CAT_ERR_IO:               return "File I/O error";
        default:                       return "Unknown error";
    }
}
