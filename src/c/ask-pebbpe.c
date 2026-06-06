#include <pebble.h>

enum {
  KEY_TYPE = 1,
  KEY_REQUEST_ID = 2,
  KEY_UTTERANCE = 3,
  KEY_STATUS = 4,
  KEY_ANSWER = 5,
  KEY_ERROR_CODE = 6,
  KEY_MESSAGE = 7,
  KEY_HAS_API_KEY = 8
};

typedef enum {
  STATE_LOADING,
  STATE_IDLE,
  STATE_MISSING_KEY,
  STATE_HELP,
  STATE_THINKING,
  STATE_ANSWER,
  STATE_ERROR
} AppState;

typedef enum {
  ERR_NONE,
  ERR_MISSING_API_KEY,
  ERR_AUTH_FAILED,
  ERR_MODEL_FAILED,
  ERR_RATE_LIMITED,
  ERR_NETWORK_FAILED,
  ERR_TIMEOUT,
  ERR_PROVIDER_FAILED,
  ERR_MIC_UNAVAILABLE
} ErrorCode;

static Window *s_main_window;
static TextLayer *s_main_text;
static TextLayer *s_sub_text;
static ScrollLayer *s_scroll_layer;
static Layer *s_bg_layer;
static char s_answer_buffer[768];

static AppState s_current_state = STATE_LOADING;
static uint32_t s_current_request_id = 0;
static char s_last_utterance[512] = {0};
static ErrorCode s_last_error_code = ERR_NONE;
static bool s_has_api_key = false;

static void set_state(AppState state);
static void send_key_state_request(void);
static void send_ask_request(const char *utterance);
static void send_cancel_request(void);
static void inbox_received_callback(DictionaryIterator *iterator, void *context);
static void inbox_dropped_callback(AppMessageResult reason, void *context);
static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context);
static void dictation_callback(DictationSession *session, DictationSessionStatus status, char *transcription, void *context);
static void window_appear_handler(Window *window);
static void click_config_provider(void *context);
static void answer_click_config_provider(void *context);

static DictationSession *s_dictation_session = NULL;

static void bg_layer_update_proc(Layer *layer, GContext *ctx) {
  GColor bg_color;
  switch (s_current_state) {
    case STATE_IDLE:
      bg_color = GColorBlue;
      break;
    case STATE_THINKING:
      bg_color = GColorPurple;
      break;
    case STATE_ERROR:
      bg_color = GColorRed;
      break;
    case STATE_MISSING_KEY:
    case STATE_HELP:
      bg_color = GColorRajah;
      break;
    default:
      bg_color = GColorWhite;
      break;
  }
  graphics_context_set_fill_color(ctx, bg_color);
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);
}

static void set_text(const char *main, const char *sub) {
  text_layer_set_text(s_main_text, main ? main : "");
  text_layer_set_text(s_sub_text, sub ? sub : "");
}

static bool is_retryable_error(ErrorCode code) {
  return code == ERR_NETWORK_FAILED || code == ERR_TIMEOUT || code == ERR_PROVIDER_FAILED;
}

static ErrorCode map_error_code(const char *code) {
  if (strcmp(code, "missing_api_key") == 0) return ERR_MISSING_API_KEY;
  if (strcmp(code, "auth_failed") == 0) return ERR_AUTH_FAILED;
  if (strcmp(code, "model_failed") == 0) return ERR_MODEL_FAILED;
  if (strcmp(code, "rate_limited") == 0) return ERR_RATE_LIMITED;
  if (strcmp(code, "network_failed") == 0) return ERR_NETWORK_FAILED;
  if (strcmp(code, "timeout") == 0) return ERR_TIMEOUT;
  if (strcmp(code, "provider_failed") == 0) return ERR_PROVIDER_FAILED;
  if (strcmp(code, "mic_unavailable") == 0) return ERR_MIC_UNAVAILABLE;
  return ERR_PROVIDER_FAILED;
}

static void set_state(AppState state) {
  Layer *window_layer = window_get_root_layer(s_main_window);
  GRect bounds = layer_get_bounds(window_layer);
  AppState prev_state = s_current_state;

  s_current_state = state;
  layer_mark_dirty(s_bg_layer);

  if (prev_state == STATE_ANSWER && state != STATE_ANSWER) {
    layer_remove_from_parent(text_layer_get_layer(s_main_text));
    layer_add_child(window_layer, text_layer_get_layer(s_main_text));
    layer_set_frame(text_layer_get_layer(s_main_text), GRect(0, bounds.size.h / 2 - 30, bounds.size.w, 60));
    layer_set_hidden(text_layer_get_layer(s_sub_text), false);
    layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
    text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
    window_set_click_config_provider(s_main_window, click_config_provider);
  }

  switch (state) {
    case STATE_LOADING:
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, bounds.size.h));
      layer_set_hidden(text_layer_get_layer(s_sub_text), false);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
      set_text("Loading...", NULL);
      text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
      text_layer_set_text_color(s_main_text, GColorBlack);
      text_layer_set_text_color(s_sub_text, GColorBlack);
      break;
    case STATE_IDLE:
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, bounds.size.h));
      layer_set_hidden(text_layer_get_layer(s_sub_text), false);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
      set_text("Ask AI", "Select to speak");
      text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
      text_layer_set_text_color(s_main_text, GColorWhite);
      text_layer_set_text_color(s_sub_text, GColorWhite);
      break;
    case STATE_MISSING_KEY:
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, bounds.size.h));
      layer_set_hidden(text_layer_get_layer(s_sub_text), false);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
      set_text("Set API key", "Open settings");
      text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
      text_layer_set_text_color(s_main_text, GColorWhite);
      text_layer_set_text_color(s_sub_text, GColorWhite);
      break;
    case STATE_HELP:
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, bounds.size.h));
      layer_set_hidden(text_layer_get_layer(s_sub_text), false);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
      set_text("Open Pebble app", "Settings > API key");
      text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
      text_layer_set_text_color(s_main_text, GColorWhite);
      text_layer_set_text_color(s_sub_text, GColorWhite);
      break;
    case STATE_THINKING:
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, bounds.size.h));
      layer_set_hidden(text_layer_get_layer(s_sub_text), false);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
      set_text("Thinking...", NULL);
      text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
      text_layer_set_text_color(s_main_text, GColorWhite);
      text_layer_set_text_color(s_sub_text, GColorWhite);
      break;
    case STATE_ANSWER: {
      layer_set_hidden(text_layer_get_layer(s_sub_text), true);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), false);
      layer_remove_from_parent(text_layer_get_layer(s_main_text));
      scroll_layer_add_child(s_scroll_layer, text_layer_get_layer(s_main_text));
      layer_set_frame(text_layer_get_layer(s_main_text), GRect(0, 0, bounds.size.w, 2000));
      text_layer_set_text_color(s_main_text, GColorBlack);
      text_layer_set_text_alignment(s_main_text, GTextAlignmentLeft);
      scroll_layer_set_content_offset(s_scroll_layer, GPoint(0, 0), false);
      GSize content_size = text_layer_get_content_size(s_main_text);
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, content_size.h + 4));
      scroll_layer_set_callbacks(s_scroll_layer, (ScrollLayerCallbacks) {
        .click_config_provider = answer_click_config_provider
      });
      scroll_layer_set_click_config_onto_window(s_scroll_layer, s_main_window);
      break;
    }
    case STATE_ERROR:
      scroll_layer_set_content_size(s_scroll_layer, GSize(bounds.size.w, bounds.size.h));
      layer_set_hidden(text_layer_get_layer(s_sub_text), false);
      layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
      text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
      text_layer_set_text_color(s_main_text, GColorWhite);
      text_layer_set_text_color(s_sub_text, GColorWhite);
      break;
  }
}

static void inbox_received_callback(DictionaryIterator *iterator, void *context) {
  Tuple *type_tuple = dict_find(iterator, KEY_TYPE);
  if (!type_tuple) return;

  const char *type = type_tuple->value->cstring;
  Tuple *request_id_tuple = dict_find(iterator, KEY_REQUEST_ID);
  uint32_t request_id = request_id_tuple ? request_id_tuple->value->uint32 : 0;

  if (request_id != s_current_request_id && strcmp(type, "key_state") != 0) {
    return;
  }

  if (strcmp(type, "key_state") == 0) {
    Tuple *has_key_tuple = dict_find(iterator, KEY_HAS_API_KEY);
    s_has_api_key = has_key_tuple ? has_key_tuple->value->uint8 : false;
    if (s_current_state == STATE_LOADING || s_current_state == STATE_IDLE ||
        s_current_state == STATE_MISSING_KEY || s_current_state == STATE_HELP) {
      if (s_has_api_key) {
        set_state(STATE_IDLE);
      } else {
        set_state(STATE_MISSING_KEY);
      }
    }
  }
  else if (strcmp(type, "answer") == 0) {
    Tuple *answer_tuple = dict_find(iterator, KEY_ANSWER);
    if (answer_tuple) {
      strncpy(s_answer_buffer, answer_tuple->value->cstring, sizeof(s_answer_buffer) - 1);
      s_answer_buffer[sizeof(s_answer_buffer) - 1] = '\0';
      text_layer_set_text(s_main_text, s_answer_buffer);
      set_state(STATE_ANSWER);
      vibes_short_pulse();
    }
  }
  else if (strcmp(type, "error") == 0) {
    Tuple *error_code_tuple = dict_find(iterator, KEY_ERROR_CODE);
    Tuple *message_tuple = dict_find(iterator, KEY_MESSAGE);
    if (error_code_tuple && message_tuple) {
      s_last_error_code = map_error_code(error_code_tuple->value->cstring);
      set_state(STATE_ERROR);
      set_text(message_tuple->value->cstring, NULL);
    }
  }
}

static void inbox_dropped_callback(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Message dropped: %d", reason);
}

static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox failed: %d", reason);
  s_last_error_code = ERR_NETWORK_FAILED;
  set_state(STATE_ERROR);
  set_text("Connection failed", NULL);
}

static void send_app_message(DictionaryIterator *iter) {
  AppMessageResult result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Failed to send message: %d", result);
  }
}

static void send_key_state_request(void) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  if (result == APP_MSG_OK) {
    dict_write_cstring(iter, KEY_TYPE, "key_state");
    dict_write_uint32(iter, KEY_REQUEST_ID, 0);
    send_app_message(iter);
  }
}

static void send_ask_request(const char *utterance) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  if (result == APP_MSG_OK) {
    dict_write_cstring(iter, KEY_TYPE, "ask");
    dict_write_uint32(iter, KEY_REQUEST_ID, ++s_current_request_id);
    dict_write_cstring(iter, KEY_UTTERANCE, utterance);
    send_app_message(iter);
  }
}

static void send_cancel_request(void) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  if (result == APP_MSG_OK) {
    dict_write_cstring(iter, KEY_TYPE, "cancel");
    dict_write_uint32(iter, KEY_REQUEST_ID, s_current_request_id);
    send_app_message(iter);
  }
}

typedef struct {
  char text[512];
} DictationContext;

static DictationContext s_dictation_context;

static void dictation_callback(DictationSession *session, DictationSessionStatus status, char *transcription, void *context) {
  if (status == DictationSessionStatusSuccess) {
    strncpy(s_dictation_context.text, transcription, sizeof(s_dictation_context.text) - 1);
    s_dictation_context.text[sizeof(s_dictation_context.text) - 1] = '\0';
    strncpy(s_last_utterance, s_dictation_context.text, sizeof(s_last_utterance) - 1);
    s_last_utterance[sizeof(s_last_utterance) - 1] = '\0';
    set_state(STATE_THINKING);
    send_ask_request(s_dictation_context.text);
  } else {
    set_state(STATE_IDLE);
  }
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  switch (s_current_state) {
    case STATE_LOADING:
      send_key_state_request();
      break;
    case STATE_IDLE:
      if (s_dictation_session) {
        dictation_session_start(s_dictation_session);
      } else {
        s_last_error_code = ERR_MIC_UNAVAILABLE;
        set_state(STATE_ERROR);
        set_text("Voice unavailable", NULL);
      }
      break;
    case STATE_MISSING_KEY:
      set_state(STATE_HELP);
      break;
    case STATE_HELP:
      break;
    case STATE_ERROR:
      if (is_retryable_error(s_last_error_code) && strlen(s_last_utterance) > 0) {
        set_state(STATE_THINKING);
        send_ask_request(s_last_utterance);
      }
      break;
    case STATE_ANSWER:
      if (s_dictation_session) {
        dictation_session_start(s_dictation_session);
      } else {
        s_last_error_code = ERR_MIC_UNAVAILABLE;
        set_state(STATE_ERROR);
        set_text("Voice unavailable", NULL);
      }
      break;
    default:
      break;
  }
}

static void back_click_handler(ClickRecognizerRef recognizer, void *context) {
  switch (s_current_state) {
    case STATE_THINKING:
      send_cancel_request();
      set_state(STATE_IDLE);
      break;
    case STATE_ANSWER:
    case STATE_ERROR:
      set_state(STATE_IDLE);
      break;
    case STATE_HELP:
      set_state(STATE_MISSING_KEY);
      break;
    default:
      window_stack_pop_all(true);
      break;
  }
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
  window_single_click_subscribe(BUTTON_ID_BACK, back_click_handler);
}

static void answer_click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
  window_single_click_subscribe(BUTTON_ID_BACK, back_click_handler);
}

static void window_appear_handler(Window *window) {
  send_key_state_request();
}

static void main_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_bg_layer = layer_create(bounds);
  layer_set_update_proc(s_bg_layer, bg_layer_update_proc);
  layer_add_child(window_layer, s_bg_layer);

  s_scroll_layer = scroll_layer_create(bounds);
  layer_set_hidden(scroll_layer_get_layer(s_scroll_layer), true);
  layer_add_child(window_layer, scroll_layer_get_layer(s_scroll_layer));

  s_main_text = text_layer_create(GRect(0, bounds.size.h / 2 - 30, bounds.size.w, 60));
  text_layer_set_font(s_main_text, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text_alignment(s_main_text, GTextAlignmentCenter);
  text_layer_set_background_color(s_main_text, GColorClear);
  layer_add_child(window_layer, text_layer_get_layer(s_main_text));

  s_sub_text = text_layer_create(GRect(0, bounds.size.h / 2 + 20, bounds.size.w, 40));
  text_layer_set_font(s_sub_text, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text_alignment(s_sub_text, GTextAlignmentCenter);
  text_layer_set_background_color(s_sub_text, GColorClear);
  layer_add_child(window_layer, text_layer_get_layer(s_sub_text));

  set_state(STATE_LOADING);
}

static void main_window_unload(Window *window) {
  layer_remove_from_parent(text_layer_get_layer(s_main_text));
  text_layer_destroy(s_main_text);
  text_layer_destroy(s_sub_text);
  scroll_layer_destroy(s_scroll_layer);
  layer_destroy(s_bg_layer);
}

static void init(void) {
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);

  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

  s_main_window = window_create();
  window_set_click_config_provider(s_main_window, click_config_provider);
  window_set_window_handlers(s_main_window, (WindowHandlers) {
    .load = main_window_load,
    .appear = window_appear_handler,
    .unload = main_window_unload
  });
  window_stack_push(s_main_window, true);

  s_dictation_session = dictation_session_create(sizeof(s_dictation_context.text), dictation_callback, &s_dictation_context);

  send_key_state_request();
}

static void deinit(void) {
  dictation_session_destroy(s_dictation_session);
  window_destroy(s_main_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
