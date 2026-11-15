/* Owned Frida acceptance target: stdin requests expose one interceptable function. */
#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#define EXPORTED __declspec(dllexport) __declspec(noinline)
#else
#define EXPORTED __attribute__((visibility("default"), noinline))
#endif

static volatile int value = 42;

EXPORTED int dshu_frida_value(void) {
  return value;
}

int main(int argc, char **argv) {
  char command[64];
  if (argc == 3 && strcmp(argv[1], "--marker") == 0) {
    FILE *output = fopen(argv[2], "wb");
    if (output == NULL) return 2;
    fprintf(output, "%d\n", dshu_frida_value());
    return fclose(output) == 0 ? 0 : 3;
  }
  puts("DSHU_FRIDA_TARGET_V1");
  fflush(stdout);
  while (fgets(command, sizeof(command), stdin) != NULL) {
    if (strncmp(command, "read", 4) == 0) {
      printf("%d\n", dshu_frida_value());
      fflush(stdout);
    } else if (strncmp(command, "stop", 4) == 0) {
      return 0;
    }
  }
  return 0;
}
