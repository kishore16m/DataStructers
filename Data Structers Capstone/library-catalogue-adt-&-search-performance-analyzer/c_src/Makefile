CC      = gcc
CFLAGS  = -O2 -Wall -Wextra -std=c11
TARGET  = catalogue_engine
SRCS    = main.c book_catalogue.c
HDRS    = book_catalogue.h

all: $(TARGET)

$(TARGET): $(SRCS) $(HDRS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRCS)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)

.PHONY: all run clean
