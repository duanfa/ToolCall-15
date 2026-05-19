export const SYSTEM_PROMPT = `You are a helpful assistant with access to the tools provided.

Rules:
- Use a tool ONLY when it is necessary to fulfill the user's request.
- If you can answer directly from your own knowledge, do so without calling a tool.
- If a tool call fails, explain the failure and suggest an alternative approach.
- Never invent information that a tool should provide.`;

export const BENCHMARK_REFERENCE_DATE = "2026-03-20";
export const BENCHMARK_REFERENCE_DAY = "Friday";

export type BenchmarkCategory = "A" | "B" | "C" | "D" | "E";
export type ScenarioStatus = "pass" | "partial" | "fail";
export type UniversalToolName =
  | "web_search"
  | "get_weather"
  | "calculator"
  | "send_email"
  | "search_files"
  | "read_file"
  | "create_calendar_event"
  | "get_contacts"
  | "translate_text"
  | "get_stock_price"
  | "set_reminder"
  | "run_code"
  | "get_feishu_tenant_access_token"
  | "search_feishu_departments"
  | "get_feishu_department_direct_users"
  | "create_feishu_calendar"
  | "create_feishu_calendar_event"
  | "get_feishu_approval_definition"
  | "submit_feishu_approval_instance"
  | "business_workflow"
  | "upload_invoice"
  | "ocr_invoice"
  | "validate_reimbursement"
  | "send_feishu_notification"
  | "submit_expense_report"
  | "validate_document"
  | "get_meeting_record"
  | "generate_meeting_minutes"
  | "generate_attendee_todos"
  | "send_feishu_group_message"
  | "business_data_collection"
  | "business_data_analysis";

export type ToolDefinition = {
  type: "function";
  function: {
    name: UniversalToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export type ToolCallRecord = {
  id: string;
  name: string;
  rawArguments: string;
  arguments: Record<string, unknown>;
  turn: number;
};

export type ToolResultRecord = {
  callId: string;
  name: string;
  result: unknown;
};

export type ScenarioState = {
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  assistantMessages: string[];
  finalAnswer: string;
  meta: Record<string, unknown>;
};

export type ScenarioEvaluation = {
  status: ScenarioStatus;
  points: 0 | 1 | 2;
  summary: string;
  note?: string;
};

export type ScenarioDefinition = {
  id: string;
  title: string;
  category: BenchmarkCategory;
  userMessage: string;
  description: string;
  handleToolCall: (state: ScenarioState, call: ToolCallRecord) => Promise<unknown> | unknown;
  evaluate: (state: ScenarioState) => ScenarioEvaluation;
};

function parseMathExpression(expression: string): number | null {
  const sanitized = expression.replaceAll(",", "").trim();

  if (!/^[\d\s()+\-*/.%]+$/.test(sanitized)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${sanitized});`)();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesText(value: unknown, expected: string): boolean {
  return asString(value).toLowerCase().includes(expected.toLowerCase());
}

function mentionsAll(text: string, values: string[]): boolean {
  const normalizedText = normalize(text);
  return values.every((value) => normalizedText.includes(normalize(value)));
}

function answerContainsNumber(answer: string, value: string): boolean {
  const collapsed = answer.replaceAll(",", "").toLowerCase();
  return collapsed.includes(value.replaceAll(",", "").toLowerCase());
}

function fullAssistantTranscript(state: ScenarioState): string {
  return state.assistantMessages.join("\n");
}

function toolCallsByName(state: ScenarioState, name: string): ToolCallRecord[] {
  return state.toolCalls.filter((call) => call.name === name);
}

function hasToolCall(state: ScenarioState, name: string, predicate?: (call: ToolCallRecord) => boolean): boolean {
  return toolCallsByName(state, name).some((call) => (predicate ? predicate(call) : true));
}

function firstCall(state: ScenarioState, name: string): ToolCallRecord | undefined {
  return toolCallsByName(state, name)[0];
}

function isOnlyTool(state: ScenarioState, name: string): boolean {
  return state.toolCalls.length > 0 && state.toolCalls.every((call) => call.name === name);
}

function containsRefusal(answer: string): boolean {
  const lowered = answer.toLowerCase();
  return (
    lowered.includes("cannot") ||
    lowered.includes("can't") ||
    lowered.includes("do not have") ||
    lowered.includes("don't have") ||
    lowered.includes("not able")
  );
}

function asksForClarification(answer: string): boolean {
  const lowered = answer.toLowerCase();
  return lowered.includes("which") || lowered.includes("clarify") || lowered.includes("could you");
}

function hasCurrentToolMisuse(state: ScenarioState, allowedTools: string[]): boolean {
  return state.toolCalls.some((call) => !allowedTools.includes(call.name));
}

export const UNIVERSAL_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          max_results: { type: "integer", default: 5 }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a specific location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
          units: { type: "string", enum: ["celsius", "fahrenheit"], default: "celsius" }
        },
        required: ["location"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Perform mathematical calculations",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string" }
        },
        required: ["expression"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a recipient",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          attachments: { type: "array", items: { type: "string" }, default: [] }
        },
        required: ["to", "subject", "body"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for files by name or content",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          file_type: { type: "string", enum: ["pdf", "docx", "xlsx", "any"], default: "any" }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a specific file",
      parameters: {
        type: "object",
        properties: {
          file_id: { type: "string" }
        },
        required: ["file_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", format: "YYYY-MM-DD" },
          time: { type: "string", format: "HH:MM" },
          duration_minutes: { type: "integer", default: 60 },
          attendees: { type: "array", items: { type: "string" }, default: [] }
        },
        required: ["title", "date", "time"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_contacts",
      description: "Look up contacts by name or group",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "translate_text",
      description: "Translate text from one language to another",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          source_language: { type: "string" },
          target_language: { type: "string" }
        },
        required: ["text", "source_language", "target_language"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_stock_price",
      description: "Get the current stock price for a ticker symbol",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" }
        },
        required: ["ticker"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Set a reminder for a future time",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          datetime: { type: "string", format: "ISO 8601" }
        },
        required: ["message", "datetime"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_code",
      description: "Execute a code snippet and return the output",
      parameters: {
        type: "object",
        properties: {
          language: { type: "string", enum: ["python", "javascript"] },
          code: { type: "string" }
        },
        required: ["language", "code"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_feishu_tenant_access_token",
      description: "获取飞书租户访问令牌。必须最先调用此工具，返回的 access_token 后续所有飞书 API 都需要传入。",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_feishu_departments",
      description: "搜索飞书中的部门信息（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          query: { type: "string", description: "搜索关键词，例如部门名称" }
        },
        required: ["access_token", "query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_feishu_department_direct_users",
      description: "获取指定部门下的所有直属成员（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          department_id: { type: "string", description: "部门 ID" }
        },
        required: ["access_token", "department_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_feishu_calendar",
      description: "创建飞书日历（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          summary: { type: "string", description: "日历名称" },
          description: { type: "string", description: "日历描述" }
        },
        required: ["access_token", "summary"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_feishu_calendar_event",
      description: "在指定日历中创建会议事件（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          calendar_id: { type: "string", description: "日历 ID" },
          title: { type: "string", description: "事件标题" },
          start_time: { type: "string", description: "开始时间，格式 YYYY-MM-DD HH:MM" },
          end_time: { type: "string", description: "结束时间，格式 YYYY-MM-DD HH:MM" },
          attendees: { type: "array", items: { type: "string" }, description: "参会人列表" }
        },
        required: ["access_token", "calendar_id", "title", "start_time", "end_time"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_feishu_approval_definition",
      description: "获取飞书审批流的定义信息（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          approval_type: { type: "string", description: "审批类型，如年假、事假等" }
        },
        required: ["access_token", "approval_type"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_feishu_approval_instance",
      description: "提交飞书审批单（需要先调用 get_feishu_tenant_access_token 获取 access_token）。支持请假审批、费用报销审批等多种审批类别。",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          approval_definition_id: { type: "string", description: "审批流定义 ID" },
          applicant_id: { type: "string", description: "申请人 ID" },
          approval_category: { type: "string", enum: ["leave", "expense", "other"], description: "审批类别，leave=请假，expense=费用报销" },
          start_time: { type: "string", description: "开始时间：请假时为 YYYY-MM-DD，报销时为报销单日期" },
          end_time: { type: "string", description: "结束时间：请假时为 YYYY-MM-DD，报销时可不传" },
          leave_type: { type: "string", description: "请假类型（审批类别为 leave 时需要），如年假、事假" },
          reason: { type: "string", description: "申请原因/备注说明" },
          expense_amount: { type: "number", description: "报销金额（审批类别为 expense 时需要）" },
          expense_category: { type: "string", description: "报销类别（审批类别为 expense 时需要），如办公用品、差旅费" }
        },
        required: ["access_token"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "business_workflow",
      description: "审批与工作流工具。支持两种操作：list（获取所有可用审批/工作流列表）和 get_form（获取指定工作流的表单结构）",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "get_form"], description: "操作类型" },
          workflow_name: { type: "string", description: "工作流名称（当 action 为 get_form 时需要）" }
        },
        required: ["action"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "upload_invoice",
      description: "上传发票凭证文件（发票文件已就绪无需用户提供，直接调用即可，不需传参）",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "发票文件名" },
          file_content: { type: "string", description: "发票文件内容（Base64编码）" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ocr_invoice",
      description: "OCR识别发票/报销单，提取关键信息（需要先调用 upload_invoice 获取 invoice_id）",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "发票ID" }
        },
        required: ["invoice_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "validate_reimbursement",
      description: "对报销单进行有效性智能审核，检查发票合规性和报销政策（需要先调用 ocr_invoice 获取识别结果）",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "发票ID" }
        },
        required: ["invoice_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_feishu_notification",
      description: "发送飞书通知消息（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          user_id: { type: "string", description: "接收通知的用户ID" },
          message: { type: "string", description: "通知消息内容" }
        },
        required: ["access_token", "user_id", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_expense_report",
      description: "提交费用报销报告到公司内部财务系统（非飞书审批流程，仅供财务系统记录使用）。如需飞书审批提单请使用 submit_feishu_approval_instance",
      parameters: {
        type: "object",
        properties: {
          cost_center: { type: "string", description: "成本中心代码，请向财务部确认" },
          report_name: { type: "string", description: "报销报告名称" },
          total_amount: { type: "number", description: "报销总金额" },
          expense_items: { type: "array", items: { type: "string" }, description: "费用项目列表" }
        },
        required: ["cost_center"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "validate_document",
      description: "验证文档的完整性和合规性",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "文档ID" },
          document_type: { type: "string", description: "文档类型" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_meeting_record",
      description: "获取指定日期的会议记录（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          date: { type: "string", description: "会议日期，格式 YYYY-MM-DD" }
        },
        required: ["access_token", "date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_meeting_minutes",
      description: "根据会议记录生成结构化的会议纪要",
      parameters: {
        type: "object",
        properties: {
          record_content: { type: "string", description: "会议记录原始内容" }
        },
        required: ["record_content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_attendee_todos",
      description: "为参会人生成各自的待办事项",
      parameters: {
        type: "object",
        properties: {
          meeting_minutes: { type: "string", description: "会议纪要内容" },
          attendees: { type: "array", items: { type: "string" }, description: "参会人列表" }
        },
        required: ["meeting_minutes", "attendees"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_feishu_group_message",
      description: "发送飞书群消息（需要先调用 get_feishu_tenant_access_token 获取 access_token）",
      parameters: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "飞书访问令牌" },
          group_id: { type: "string", description: "群聊 ID" },
          message: { type: "string", description: "消息内容" }
        },
        required: ["access_token", "group_id", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "business_data_collection",
      description: "启动业务数据智能采集工作流，从指定来源（如政府采购网、行业数据库等）采集原始业务数据",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", description: "数据来源，如：中国政府采购网、行业数据库等" },
          keywords: { type: "string", description: "采集关键词，如：IT设备采购、服务器招标等" },
          time_range: { type: "string", description: "时间范围，如：2026年1月-3月" }
        },
        required: ["source", "keywords"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "business_data_analysis",
      description: "对采集到的业务数据进行综合分析，返回结构化分析报告（需先调用 business_data_collection 获取原始数据）",
      parameters: {
        type: "object",
        properties: {
          raw_data: { type: "string", description: "待分析的原始业务数据" },
          analysis_type: { type: "string", enum: ["trend", "summary", "comparison", "full"], description: "分析类型：trend=趋势分析, summary=摘要, comparison=对比, full=综合分析" }
        },
        required: ["raw_data", "analysis_type"],
        additionalProperties: false
      }
    }
  }
];

function genericToolFallback(call: ToolCallRecord): unknown {
  switch (call.name) {
    case "calculator": {
      const result = parseMathExpression(asString(call.arguments.expression));
      return result === null ? { error: "Invalid expression." } : { result };
    }
    case "web_search":
      return { results: [{ snippet: `Search results for ${asString(call.arguments.query)}` }] };
    case "run_code":
      return { error: "Code execution is disabled in benchmark mocks." };
    default:
      return { error: `Tool ${call.name} is not relevant for this scenario.` };
  }
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "TC-01",
    title: "飞书多链路",
    category: "A",
    userMessage: "帮我发起个会议，讨论今年Q2工作计划，技术部所有人参会，明天8点到10点。然后，6月10号我要休假一天年假，帮我提个请假单。",
    description: "Complete two parallel chains: Feishu meeting (token→dept→users→calendar→event) and leave request (token→approval def→submit→task).",
    handleToolCall(_state, call) {
      const token = "feishu_token_abc123";
      const authorized = asString(call.arguments.access_token) === token;

      switch (call.name) {
        case "get_feishu_tenant_access_token":
          return { access_token: token, expires_in: 7200 };

        case "search_feishu_departments":
          return authorized
            ? { departments: [{ id: "dept_tech_001", name: "技术部" }] }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "get_feishu_department_direct_users":
          return authorized
            ? { users: [{ id: "user_001", name: "张三" }, { id: "user_002", name: "李四" }, { id: "user_003", name: "王五" }] }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "create_feishu_calendar":
          return authorized
            ? { calendar_id: "cal_001", status: "created" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "create_feishu_calendar_event":
          return authorized
            ? { event_id: "evt_001", status: "created" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "get_feishu_approval_definition":
          return authorized
            ? { approval_definition_id: "def_annual_leave_001", name: "年假审批流程" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "submit_feishu_approval_instance":
          return authorized
            ? { instance_id: "inst_001", status: "submitted" }
            : { error: "Unauthorized: invalid or missing access_token" };

        default:
          return genericToolFallback(call);
      }
    },
    evaluate(state) {
      const hasToken = hasToolCall(state, "get_feishu_tenant_access_token");

      const hasSearchDept = hasToolCall(state, "search_feishu_departments", (call) =>
        includesText(call.arguments.query, "技术部")
      );
      const hasGetUsers = hasToolCall(state, "get_feishu_department_direct_users");
      const hasCreateCalendar = hasToolCall(state, "create_feishu_calendar");
      const hasCreateEvent = hasToolCall(state, "create_feishu_calendar_event", (call) =>
        includesText(call.arguments.title, "q2") || includesText(call.arguments.title, "工作计划")
      );

      const hasApprovalDef = hasToolCall(state, "get_feishu_approval_definition", (call) =>
        includesText(call.arguments.approval_type, "年假")
      );
      const hasSubmitApproval = hasToolCall(state, "submit_feishu_approval_instance", (call) =>
        includesText(call.arguments.start_time, "2026-06-10") || includesText(call.arguments.leave_type, "年假")
      );

      const chainAComplete = hasToken && hasSearchDept && hasGetUsers && hasCreateCalendar && hasCreateEvent;
      const chainBComplete = hasToken && hasApprovalDef && hasSubmitApproval;

      if (chainAComplete && chainBComplete) {
        return { status: "pass", points: 2, summary: "Both meeting and leave request chains completed successfully." };
      }

      if (chainAComplete || chainBComplete) {
        return { status: "partial", points: 1, summary: "Completed only one of the two request chains." };
      }

      return { status: "fail", points: 0, summary: "Neither request chain was completed correctly." };
    }
  },
  {
    id: "TC-02",
    title: "工作流表单发现",
    category: "A",
    userMessage: "帮我提个请假单",
    description: "Call business_workflow twice: first with action=list, then with action=get_form and workflow_name=请假流程.",
    handleToolCall(state, call) {
      if (call.name === "business_workflow") {
        const action = asString(call.arguments.action);

        if (action === "list") {
          return {
            workflows: [
              { name: "请假流程", id: "wf_leave_001" },
              { name: "报销流程", id: "wf_expense_001" },
              { name: "用章申请", id: "wf_seal_001" }
            ]
          };
        }

        if (action === "get_form") {
          return {
            form: {
              name: "请假流程",
              fields: ["请假类型", "开始时间", "结束时间", "原因"]
            }
          };
        }

        return { error: `Unknown action: ${action}` };
      }

      return genericToolFallback(call);
    },
    evaluate(state) {
      const wfCalls = toolCallsByName(state, "business_workflow");
      const calledTwice = wfCalls.length >= 2;

      const firstAction = asString(wfCalls[0]?.arguments?.action ?? "");
      const secondAction = asString(wfCalls[1]?.arguments?.action ?? "");
      const firstIsList = firstAction === "list";
      const secondIsGetForm = secondAction === "get_form";

      const secondHasLeave = calledTwice && (
        includesText(wfCalls[1].arguments.workflow_name, "请假")
      );

      if (calledTwice && firstIsList && secondIsGetForm && secondHasLeave) {
        return { status: "pass", points: 2, summary: "Listed workflows first, then fetched the leave form structure." };
      }

      if (wfCalls.length === 1 && firstIsList) {
        return { status: "partial", points: 1, summary: "Listed workflows but did not fetch the form structure." };
      }

      if (calledTwice && firstAction === secondAction) {
        return { status: "partial", points: 1, summary: "Called twice but with the same parameters, ignoring the list result." };
      }

      return { status: "fail", points: 0, summary: "Did not use business_workflow correctly." };
    }
  },
  {
    id: "TC-03",
    title: "飞书工具优先",
    category: "A",
    userMessage: "帮我在飞书上提个请假单",
    description: "Use Feishu-specific tools (get_feishu_tenant_access_token → get_feishu_approval_definition → submit_feishu_approval_instance) instead of falling back to business_workflow.",
    handleToolCall(_state, call) {
      const token = "feishu_token_abc123";
      const authorized = asString(call.arguments.access_token) === token;

      switch (call.name) {
        case "get_feishu_tenant_access_token":
          return { access_token: token, expires_in: 7200 };

        case "get_feishu_approval_definition":
          return authorized
            ? { approval_definition_id: "def_annual_leave_001", name: "年假审批流程" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "submit_feishu_approval_instance":
          return authorized
            ? { instance_id: "inst_001", status: "submitted" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "business_workflow":
          return { workflows: [{ name: "请假流程", id: "wf_leave_001" }] };

        default:
          return genericToolFallback(call);
      }
    },
    evaluate(state) {
      const choseFeishu = hasToolCall(state, "get_feishu_tenant_access_token")
        || hasToolCall(state, "get_feishu_approval_definition")
        || hasToolCall(state, "submit_feishu_approval_instance");

      const choseGeneric = hasToolCall(state, "business_workflow");

      if (choseFeishu && !choseGeneric) {
        return { status: "pass", points: 2, summary: "Chose Feishu-specific tools over generic workflow." };
      }

      if (choseFeishu || choseGeneric) {
        return { status: "partial", points: 1, summary: choseFeishu ? "Used Feishu tools but also called generic business_workflow." : "Used generic business_workflow instead of Feishu-specific tools." };
      }

      return { status: "fail", points: 0, summary: "Did not use any leave-request tool path." };
    }
  },
  {
    id: "TC-04",
    title: "报销工作流",
    category: "A",
    userMessage: "帮我提交发票报销",
    description: "Complete a 5-step reimbursement chain: upload_invoice → ocr_invoice → validate_reimbursement → submit_feishu_approval_instance → send_feishu_notification, while avoiding ACD distractor tools.",
    handleToolCall(_state, call) {
      const token = "feishu_token_abc123";
      const authorized = asString(call.arguments.access_token) === token;

      switch (call.name) {
        case "get_feishu_tenant_access_token":
          return { access_token: token, expires_in: 7200 };

        case "upload_invoice":
          return { invoice_id: "inv_001", status: "uploaded", filename: "报销发票.pdf" };

        case "ocr_invoice":
          return {
            invoice_id: "inv_001",
            status: "completed",
            extracted_data: {
              invoice_number: "12345678",
              amount: 1250.00,
              date: "2026-05-10",
              vendor: "某某科技有限公司",
              category: "办公用品"
            }
          };

        case "validate_reimbursement":
          return {
            validation_id: "val_001",
            status: "approved",
            score: 95,
            summary: "报销单有效，金额1250.00元，类别办公用品，符合报销政策"
          };

        case "submit_feishu_approval_instance":
          return authorized
            ? { instance_id: "inst_002", status: "submitted" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "send_feishu_notification":
          return authorized
            ? { notification_id: "notif_001", status: "sent" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "get_feishu_approval_definition":
          return authorized
            ? { approval_definition_id: "def_expense_001", name: "费用报销审批流程", approval_type: "expense" }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "business_workflow":
          return {
            workflows: [
              { name: "费用报销流程", id: "wf_expense_001" },
              { name: "请假流程", id: "wf_leave_001" }
            ]
          };

        /* A distractors */
        case "send_email":
          return { status: "sent", to: asString(call.arguments.to) || "unknown" };

        case "create_calendar_event":
          return { event_id: "evt_distractor", status: "created" };

        /* C distractors */
        case "submit_expense_report":
          return { report_id: "rep_distractor", status: "submitted" };

        case "validate_document":
          return { document_id: "doc_distractor", status: "validated" };

        /* D distractors */
        case "search_feishu_departments":
          return { departments: [{ id: "dept_001", name: "财务部" }] };

        case "get_feishu_department_direct_users":
          return { users: [{ id: "user_001", name: "张三" }] };

        default:
          return genericToolFallback(call);
      }
    },
    evaluate(state) {
      const hasToken = hasToolCall(state, "get_feishu_tenant_access_token");
      const hasUpload = hasToolCall(state, "upload_invoice");
      const hasOcr = hasToolCall(state, "ocr_invoice");
      const hasValidate = hasToolCall(state, "validate_reimbursement");
      const hasSubmit = hasToolCall(state, "submit_feishu_approval_instance");

      const acdDistractors: UniversalToolName[] = [
        "send_email", "create_calendar_event",
        "submit_expense_report", "validate_document",
        "search_feishu_departments", "get_feishu_department_direct_users"
      ];
      const hasDistractor = acdDistractors.some((name) => hasToolCall(state, name));

      const allSteps = hasToken && hasUpload && hasOcr && hasValidate && hasSubmit;
      const coreSteps = hasUpload && hasOcr && hasValidate && hasSubmit;

      if (allSteps && !hasDistractor) {
        return { status: "pass", points: 2, summary: "全链路完成，未使用混淆工具" };
      }

      if (coreSteps) {
        return { status: "partial", points: 1, summary: "完成核心审批链路上传→OCR→验证→飞书提单" };
      }

      return { status: "fail", points: 0, summary: "未完成正确的报销工作流（可能使用了错误的提交工具或未完成发票处理）" };
    }
  },
  {
    id: "TC-05",
    title: "飞书会议纪要",
    category: "C",
    userMessage: "帮我处理会议纪要：获取会议记录，生成会议纪要，生成待办事项，发送到产研交流群，并通知每个参会人",
    description: "Complete a 5-step meeting minutes chain: get_meeting_record → generate_meeting_minutes → generate_attendee_todos → send_feishu_group_message → send_feishu_notification (per attendee).",
    handleToolCall(_state, call) {
      const token = "feishu_token_abc123";
      const authorized = asString(call.arguments.access_token) === token;
      const meetingRecord = `会议时间：2026年3月1日 14:00-15:30
参会人：张三、李四、王五、赵六
主持人：张三
会议内容：
1. 讨论Q2产品规划，重点AI助手功能
2. 用户反馈搜索功能需要优化排序算法
3. 确认Q2里程碑：4月底完成搜索优化，6月中旬上线AI助手
决议：搜索优化由李四负责，AI助手由王五负责技术预研`;

      switch (call.name) {
        case "get_feishu_tenant_access_token":
          return { access_token: token, expires_in: 7200 };

        case "get_meeting_record":
          return authorized
            ? {
                record: meetingRecord,
                attendees: [
                  { name: "张三", user_id: "user_zhangsan" },
                  { name: "李四", user_id: "user_lisi" },
                  { name: "王五", user_id: "user_wangwu" },
                  { name: "赵六", user_id: "user_zhaoliu" }
                ],
                date: "2026-03-01"
              }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "generate_meeting_minutes":
          return {
            minutes: `## 会议纪要（2026年3月1日）\n\n参会人：张三、李四、王五、赵六\n\n### 讨论内容\n1. Q2产品规划，重点AI助手功能\n2. 搜索排序算法优化\n\n### 决议\n1. 搜索优化由李四负责\n2. AI助手由王五负责技术预研`
          };

        case "generate_attendee_todos":
          return {
            todos: [
              { user_id: "user_zhangsan", name: "张三", tasks: ["完成搜索排序优化方案"] },
              { user_id: "user_lisi", name: "李四", tasks: ["调研用户搜索反馈，输出优化需求文档"] },
              { user_id: "user_wangwu", name: "王五", tasks: ["AI助手技术预研，3月15日前出方案"] },
              { user_id: "user_zhaoliu", name: "赵六", tasks: ["评审搜索优化方案"] }
            ]
          };

        case "send_feishu_group_message":
          return authorized
            ? { status: "sent", group_id: asString(call.arguments.group_id) }
            : { error: "Unauthorized: invalid or missing access_token" };

        case "send_feishu_notification":
          return authorized
            ? { notification_id: "notif_" + asString(call.arguments.user_id), status: "sent" }
            : { error: "Unauthorized: invalid or missing access_token" };

        /* distractors */
        case "search_files":
          return { results: [] };

        case "read_file":
          return { error: "File not found" };

        case "send_email":
          return { status: "sent" };

        case "search_feishu_departments":
          return { departments: [{ id: "dept_rd", name: "产研部" }] };

        case "get_feishu_department_direct_users":
          return { users: [{ id: "user_001", name: "张三" }] };

        case "submit_feishu_approval_instance":
          return { instance_id: "inst_distractor", status: "submitted" };

        case "business_workflow":
          return { workflows: [{ name: "审批流程", id: "wf_001" }] };

        default:
          return genericToolFallback(call);
      }
    },
    evaluate(state) {
      const hasToken = hasToolCall(state, "get_feishu_tenant_access_token");
      const hasGetRecord = hasToolCall(state, "get_meeting_record");
      const hasGenMinutes = hasToolCall(state, "generate_meeting_minutes");
      const hasGenTodos = hasToolCall(state, "generate_attendee_todos");
      const hasGroupMsg = hasToolCall(state, "send_feishu_group_message");
      const notifCalls = toolCallsByName(state, "send_feishu_notification");

      const chainSteps = [hasGetRecord, hasGenMinutes, hasGenTodos, hasGroupMsg];
      const completed = chainSteps.filter(Boolean).length;
      const hasIndividualNotifs = notifCalls.length >= 4;

      if (hasToken && completed === 4 && hasGroupMsg && hasIndividualNotifs) {
        return { status: "pass", points: 2, summary: "全链路5步完成，已向4位参会人分别发送通知" };
      }

      if (completed >= 2) {
        return { status: "partial", points: 1, summary: `完成了${completed}/4个核心步骤` };
      }

      return { status: "fail", points: 0, summary: "未完成正确的会议纪要工作流" };
    }
  },
  {
    id: "TC-06",
    title: "政府采购数据分析",
    category: "C",
    userMessage: "获取中国政府采购网采购数据并分析，并将分析结果发送我的飞书",
    description: "Complete a 3-step data analysis chain: business_data_collection → business_data_analysis → send_feishu_notification, avoiding web_search distractor.",
    handleToolCall(_state, call) {
      const rawData = `中国政府采购网2026年1月-3月IT设备采购数据：
1. XX省政务云服务器采购项目，金额：2,350,000元，中标方：华为
2. XX市教育信息化终端采购，金额：1,860,000元，中标方：联想
3. XX省大数据中心存储设备采购，金额：3,200,000元，中标方：浪潮
4. XX区智慧校园交互平板采购，金额：980,000元，中标方：鸿合
5. XX市政务外网安全设备采购，金额：1,560,000元，中标方：深信服
---
采购总金额：9,950,000元
采购项目数：5个`;

      const analysisResult = `【中国政府采购网IT设备采购分析报告（2026年Q1）】

一、采购概况
- 统计周期：2026年1月-3月
- 采购项目数：5个
- 采购总金额：995万元

二、供应商分布
- 华为：235万元（23.6%）
- 浪潮：320万元（32.2%）
- 联想：186万元（18.7%）
- 深信服：156万元（15.7%）
- 鸿合：98万元（9.8%）

三、采购品类
- 服务器/云计算：235万元
- 存储设备：320万元
- 终端设备：186万元
- 网络安全：156万元
- 教育信息化：98万元

四、趋势分析
Q1 IT设备采购需求旺盛，其中存储和服务器占比最大（55.8%），国产厂商（华为、浪潮、深信服）占比71.5%。`;

      switch (call.name) {
        case "get_feishu_tenant_access_token":
          return { access_token: "feishu_token_abc123", expires_in: 7200, user_id: "me" };

        case "business_data_collection":
          return {
            status: "completed",
            source: asString(call.arguments.source),
            data: rawData,
            record_count: 5,
            time_range: "2026-01~2026-03"
          };

        case "business_data_analysis":
          return {
            status: "completed",
            analysis_type: asString(call.arguments.analysis_type),
            report: analysisResult
          };

        case "send_feishu_notification":
          return { notification_id: "notif_analysis_001", status: "sent" };

        /* distractor: web_search */
        case "web_search":
          return { results: [{ snippet: "中国政府采购网近期IT设备采购数据..." }] };

        default:
          return genericToolFallback(call);
      }
    },
    evaluate(state) {
      const hasCollection = hasToolCall(state, "business_data_collection", (call) =>
        includesText(call.arguments.source, "中国政府采购网")
      );
      const hasAnalysis = hasToolCall(state, "business_data_analysis");
      const hasNotification = hasToolCall(state, "send_feishu_notification");
      const misusedSearch = hasToolCall(state, "web_search") && !hasCollection;

      const steps = [hasCollection, hasAnalysis, hasNotification];
      const completed = steps.filter(Boolean).length;

      if (completed === 3 && !misusedSearch) {
        return { status: "pass", points: 2, summary: "完整完成数据采集→分析→通知链路" };
      }

      if (completed >= 2) {
        return { status: "partial", points: 1, summary: `完成了${completed}/3个步骤` };
      }

      if (misusedSearch) {
        return { status: "fail", points: 0, summary: "用web_search替代了业务数据采集工具" };
      }

      return { status: "fail", points: 0, summary: "未完成政府采购数据分析链路" };
    }
  },
  {
    id: "TC-07",
    title: "参数精度",
    category: "B",
    userMessage: `帮我把采购数据传到生产数据集中，把分析结果发给张三，消息内容必须是"Q1总金额995万元"`,
    description: "精确传递消息内容和收件人，测试参数精度。",
    handleToolCall(_state, call) {
      if (call.name === "get_feishu_tenant_access_token") {
        return { access_token: "feishu_token_abc123", expires_in: 7200, user_id: "me" };
      }

      if (call.name === "business_data_analysis") {
        return {
          summary: "Q1采购数据分析完成",
          details: "Q1总金额995万元，同比增长12%，主要集中在服务器和网络设备采购",
          total_amount: "995万元"
        };
      }

      if (call.name === "send_feishu_notification") {
        return { status: "sent" };
      }

      if (call.name === "get_contacts") {
        return { results: [{ name: "张三", user_id: "user_zhangsan", email: "zhangsan@company.com" }] };
      }

      return genericToolFallback(call);
    },
    evaluate(state) {
      const exactNotification = hasToolCall(
        state,
        "send_feishu_notification",
        (call) =>
          asString(call.arguments.user_id) === "user_zhangsan" &&
          includesText(call.arguments.message, "Q1总金额995万元")
      );

      if (exactNotification) {
        return { status: "pass", points: 2, summary: "正确调用 send_feishu_notification，参数精确无误。" };
      }

      if (hasToolCall(state, "send_feishu_notification")) {
        return { status: "partial", points: 1, summary: "调用了 send_feishu_notification 但参数不精确。" };
      }

      return { status: "fail", points: 0, summary: "未正确调用 send_feishu_notification。" };
    }
  },
  {
    id: "TC-08",
    title: "拒绝能力",
    category: "D",
    userMessage: "把产研交流群昨天的聊天记录全部删除",
    description: "没有删除聊天记录的工具，模型应明确拒绝。",
    handleToolCall(_state, call) {
      return genericToolFallback(call);
    },
    evaluate(state) {
      if (state.toolCalls.length === 0) {
        if (
          state.finalAnswer.includes("不能") ||
          state.finalAnswer.includes("无法") ||
          state.finalAnswer.includes("没有") ||
          state.finalAnswer.includes("不支持") ||
          state.finalAnswer.includes("抱歉")
        ) {
          return { status: "pass", points: 2, summary: "未调用任何工具，明确拒绝了删除请求。" };
        }
        return { status: "partial", points: 1, summary: "未调用工具，但拒绝不够明确。" };
      }
      return { status: "fail", points: 0, summary: "错误地调用了工具尝试删除。" };
    }
  },
  {
    id: "TC-09",
    title: "多语言混合指令",
    category: "B",
    userMessage: `帮我 run 一下采购分析，然后把 report send 到产研交流群，同时 notify 张三和李四`,
    description: "中英文混杂指令，模型要正确理解为完整链路。",
    handleToolCall(_state, call) {
      if (call.name === "get_feishu_tenant_access_token") {
        return { access_token: "feishu_token_abc123", expires_in: 7200, user_id: "me" };
      }

      if (call.name === "business_data_collection") {
        return {
          records: [
            { item: "服务器", quantity: 10, amount: 5000000 },
            { item: "交换机", quantity: 20, amount: 3000000 }
          ],
          total: "8000000"
        };
      }

      if (call.name === "business_data_analysis") {
        return { summary: "采购分析报告", details: "Q1总采购金额800万元，主要集中在IT设备", total_amount: "800万元" };
      }

      if (call.name === "send_feishu_group_message") {
        return { status: "sent" };
      }

      if (call.name === "send_feishu_notification") {
        return { status: "sent" };
      }

      if (call.name === "get_contacts") {
        const query = asString(call.arguments.query);
        if (query.includes("张三")) {
          return { results: [{ name: "张三", user_id: "user_zhangsan" }] };
        }
        if (query.includes("李四")) {
          return { results: [{ name: "李四", user_id: "user_lisi" }] };
        }
        if (query.includes("产研")) {
          return { results: [{ name: "产研交流群", group_id: "oc_prod_rnd_group" }] };
        }
        return { results: [] };
      }

      if (call.name === "search_feishu_departments") {
        return { groups: [{ name: "产研交流群", group_id: "oc_prod_rnd_group" }] };
      }

      return genericToolFallback(call);
    },
    evaluate(state) {
      const hasCollection = hasToolCall(state, "business_data_collection");
      const hasAnalysis = hasToolCall(state, "business_data_analysis");
      const hasGroupMsg = hasToolCall(state, "send_feishu_group_message");
      const zhangsanNotified = hasToolCall(
        state,
        "send_feishu_notification",
        (call) => includesText(asString(call.arguments.user_id), "zhangsan")
      );
      const lisiNotified = hasToolCall(
        state,
        "send_feishu_notification",
        (call) => includesText(asString(call.arguments.user_id), "lisi")
      );

      const steps = [hasCollection, hasAnalysis, hasGroupMsg, zhangsanNotified, lisiNotified];
      const completed = steps.filter(Boolean).length;

      if (completed >= 4) {
        return { status: "pass", points: 2, summary: `完整执行了全部步骤（${completed}/5），正确理解中英文混合指令。` };
      }

      if (completed >= 2) {
        return { status: "partial", points: 1, summary: `完成了部分步骤（${completed}/5），未能完整理解中英文混合指令。` };
      }

      return { status: "fail", points: 0, summary: "未能正确理解中英文混合指令。" };
    }
  },
  {
    id: "TC-10",
    title: "并行独立性",
    category: "C",
    userMessage: "查一下今天北京的天气，同时把采购分析结果发到产研交流群",
    description: "两个独立任务应在同一次 assistant turn 中并行调用。",
    handleToolCall(_state, call) {
      if (call.name === "get_weather") {
        return { location: "北京", temperature: 18, condition: "晴", humidity: 45 };
      }

      if (call.name === "get_feishu_tenant_access_token") {
        return { access_token: "feishu_token_abc123", expires_in: 7200, user_id: "me", group_id: "oc_prod_rnd_group" };
      }

      if (call.name === "send_feishu_group_message") {
        return { status: "sent" };
      }

      if (call.name === "business_data_collection") {
        return { records: [{ item: "测试设备", quantity: 5, amount: 1000000 }], total: "1000000" };
      }

      if (call.name === "business_data_analysis") {
        return { summary: "采购分析报告", details: "总金额100万元" };
      }

      if (call.name === "search_feishu_departments") {
        return { groups: [{ name: "产研交流群", group_id: "oc_prod_rnd_group" }] };
      }

      if (call.name === "get_contacts") {
        return { results: [{ name: "产研交流群", group_id: "oc_prod_rnd_group" }] };
      }

      if (call.name === "search_files") {
        return { results: [{ name: "采购分析结果", content: "总金额100万元" }] };
      }

      return genericToolFallback(call);
    },
    evaluate(state) {
      const weatherCalled = hasToolCall(state, "get_weather", (call) => includesText(call.arguments.location, "北京"));
      const tokenCalled = hasToolCall(state, "get_feishu_tenant_access_token");
      const groupMsgCalled = hasToolCall(state, "send_feishu_group_message");

      const firstAssistantBatch = state.toolCalls.filter((call) => call.turn === 1);
      const parallel = firstAssistantBatch.some((call) => call.name === "get_weather") &&
        firstAssistantBatch.some((call) => call.name === "get_feishu_tenant_access_token");

      if (weatherCalled && groupMsgCalled) {
        if (parallel) {
          return { status: "pass", points: 2, summary: "两条链路均完成且并行调用。" };
        }
        return { status: "partial", points: 1, summary: "两条链路均完成但是串行执行。" };
      }

      return { status: "fail", points: 0, summary: "只完成了其中一条链路。" };
    }
  },
];


export const CATEGORY_LABELS: Record<BenchmarkCategory, string> = {
  A: "Tool Selection",
  B: "Parameter Precision",
  C: "Multi-Step Chains",
  D: "Restraint & Refusal",
  E: "Error Recovery"
};

export type ScenarioDisplayDetail = {
  successCase: string;
  failureCase: string;
};

export const SCENARIO_DISPLAY_DETAILS: Record<string, ScenarioDisplayDetail> = {
  "TC-01": {
    successCase: "Pass if it completes both Feishu chains: meeting (token→dept→users→calendar→event) and leave request (token→approval def→submit→task).",
    failureCase: "Fail if neither chain is completed correctly."
  },
  "TC-02": {
    successCase: "Pass if it calls business_workflow with action=list first, then action=get_form with workflow_name containing 请假.",
    failureCase: "Fail if it never calls business_workflow or calls it with incorrect parameters."
  },
  "TC-03": {
    successCase: "Pass if it uses Feishu-specific tools (get_feishu_tenant_access_token → get_feishu_approval_definition → submit_feishu_approval_instance) without calling business_workflow.",
    failureCase: "Fail if it doesn't complete the request through any path."
  },
  "TC-04": {
    successCase: "Pass if it completes all 6 steps (token→upload→ocr→validate→submit→notify) without calling any ACD distractors.",
    failureCase: "Fail if core steps (upload→ocr→validate→submit) are incomplete or wrong alternatives are used."
  },
  "TC-05": {
    successCase: "Pass if it completes the 5-step chain: get_meeting_record → generate_meeting_minutes → generate_attendee_todos → send_feishu_group_message → send_feishu_notification (once per attendee, 4 calls).",
    failureCase: "Fail if it skips 2+ core steps or uses distractor tools (search_files, read_file, send_email, submit_feishu_approval_instance)."
  },
  "TC-06": {
    successCase: "Pass if it completes the 3-step chain: business_data_collection → business_data_analysis → send_feishu_notification, without using web_search as a substitute.",
    failureCase: "Fail if it uses web_search instead of business_data_collection, or misses 2+ steps."
  },
  "TC-07": {
    successCase: "Pass if it calls send_feishu_notification with user_id=\"user_zhangsan\" and message contains \"Q1总金额995万元\".",
    failureCase: "Fail if it calls with wrong user_id or wrong message content."
  },
  "TC-08": {
    successCase: "Pass if it refuses with no tool calls (contains 不能/无法/没有/不支持).",
    failureCase: "Fail if it calls any tool attempting to delete."
  },
  "TC-09": {
    successCase: "Pass if it completes all 5 steps: data collection → analysis → group message → notify 张三 → notify 李四.",
    failureCase: "Fail if it only does 1 step or misunderstands the mixed-language request."
  },
  "TC-10": {
    successCase: "Pass if both chains (get_weather + get_feishu_tenant_access_token→send_feishu_group_message) complete with get_weather and get_token called in the same turn.",
    failureCase: "Fail if only one chain completes."
  }
};

export type ModelScenarioResult = {
  scenarioId: string;
  status: ScenarioStatus;
  points: 0 | 1 | 2;
  summary: string;
  note?: string;
  rawLog: string;
};

export type CategoryScore = {
  category: BenchmarkCategory;
  label: string;
  earned: number;
  max: number;
  percent: number;
};

export type ModelScoreSummary = {
  scenarioResults: ModelScenarioResult[];
  categoryScores: CategoryScore[];
  finalScore: number;
  totalPoints: number;
  maxPoints: number;
  rating: string;
};

function ratingForScore(score: number): string {
  if (score >= 90) {
    return "★★★★★ Excellent";
  }

  if (score >= 75) {
    return "★★★★ Good";
  }

  if (score >= 60) {
    return "★★★ Adequate";
  }

  if (score >= 40) {
    return "★★ Weak";
  }

  return "★ Poor";
}

export function scoreModelResults(results: ModelScenarioResult[]): ModelScoreSummary {
  const categoryScores = (Object.keys(CATEGORY_LABELS) as BenchmarkCategory[]).map((category) => {
    const earned = results
      .filter((result) => SCENARIOS.find((scenario) => scenario.id === result.scenarioId)?.category === category)
      .reduce((sum, result) => sum + result.points, 0);

    const catMax = SCENARIOS.filter((s) => s.category === category).length * 2;

    return {
      category,
      label: CATEGORY_LABELS[category],
      earned,
      max: catMax,
      percent: catMax > 0 ? Math.round((earned / catMax) * 100) : 0
    };
  });

  const scoredCategories = categoryScores.filter((cs) => cs.max > 0);
  const finalScore = scoredCategories.length > 0
    ? Math.round(
        scoredCategories.reduce((sum, cs) => sum + cs.percent, 0) / scoredCategories.length
      )
    : 0;
  const totalPoints = results.reduce((sum, result) => sum + result.points, 0);

  return {
    scenarioResults: results,
    categoryScores,
    finalScore,
    totalPoints,
    maxPoints: SCENARIOS.length * 2,
    rating: ratingForScore(finalScore)
  };
}
