// ML-CAL-1 G4 Windows W5 path-identity inspector (disposable/test builds).
// Schema version 1. No elevation, privilege enablement, or writes.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace WindowsG4FsInspect
{
    internal static class Native
    {
        public const uint GENERIC_READ = 0x80000000;
        public const uint FILE_SHARE_READ = 0x1;
        public const uint FILE_SHARE_WRITE = 0x2;
        public const uint FILE_SHARE_DELETE = 0x4;
        public const uint OPEN_EXISTING = 3;
        public const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
        public const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
        public const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x400;
        public const uint FILE_ATTRIBUTE_DIRECTORY = 0x10;
        public const uint VOLUME_NAME_GUID = 0x1;
        public const uint VOLUME_NAME_NT = 0x2;
        public const int FIND_FIRST_EX_CASE_SENSITIVE = 1;
        public const uint IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003;
        public const uint IO_REPARSE_TAG_SYMLINK = 0xA000000C;
        public static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential, Pack = 4)]
        public struct BY_HANDLE_FILE_INFORMATION
        {
            public uint dwFileAttributes;
            public uint ftCreationTimeLow;
            public uint ftCreationTimeHigh;
            public uint ftLastAccessTimeLow;
            public uint ftLastAccessTimeHigh;
            public uint ftLastWriteTimeLow;
            public uint ftLastWriteTimeHigh;
            public uint dwVolumeSerialNumber;
            public uint nFileSizeHigh;
            public uint nFileSizeLow;
            public uint nNumberOfLinks;
            public uint nFileIndexHigh;
            public uint nFileIndexLow;
        }

        // Pack=4: native WIN32_FIND_DATAW has no 8-byte padding after dwFileAttributes.
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
        public struct WIN32_FIND_DATA
        {
            public uint dwFileAttributes;
            public uint ftCreationTimeLow;
            public uint ftCreationTimeHigh;
            public uint ftLastAccessTimeLow;
            public uint ftLastAccessTimeHigh;
            public uint ftLastWriteTimeLow;
            public uint ftLastWriteTimeHigh;
            public uint nFileSizeHigh;
            public uint nFileSizeLow;
            public uint dwReserved0;
            public uint dwReserved1;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string cFileName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)]
            public string cAlternateFileName;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_STATUS_BLOCK
        {
            public IntPtr Status;
            public IntPtr Information;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct FILE_CASE_SENSITIVE_INFORMATION
        {
            public uint Flags;
        }

        public const int FileCaseSensitiveInformation = 71;
        public const uint FILE_CS_FLAG_CASE_SENSITIVE_DIR = 1;
        // FILE_INFO_BY_HANDLE_CLASS.FileAttributeTagInfo
        public const int FileAttributeTagInfo = 9;

        [StructLayout(LayoutKind.Sequential)]
        public struct FILE_ATTRIBUTE_TAG_INFO
        {
            public uint FileAttributes;
            public uint ReparseTag;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
            IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern uint GetFinalPathNameByHandleW(IntPtr hFile, StringBuilder lpszFilePath, uint cchFilePath, uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetFileInformationByHandle(IntPtr hFile, out BY_HANDLE_FILE_INFORMATION lpFileInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetFileInformationByHandleEx(IntPtr hFile, int FileInformationClass,
            IntPtr lpFileInformation, uint dwBufferSize);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern IntPtr FindFirstFileExW(string lpFileName, int fInfoLevelId, IntPtr lpFindFileData,
            int fSearchOp, IntPtr lpSearchFilter, int dwAdditionalFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool FindClose(IntPtr hFindFile);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool GetVolumeNameForVolumeMountPointW(string lpszVolumeMountPoint, StringBuilder lpszVolumeName, uint cchBufferLength);

        [DllImport("ntdll.dll")]
        public static extern int NtQueryInformationFile(IntPtr FileHandle, out IO_STATUS_BLOCK IoStatusBlock,
            IntPtr FileInformation, uint Length, int FileInformationClass);
    }

    internal enum CasePolicy
    {
        Insensitive = 0,
        Sensitive = 1,
        Unproven = 2
    }

    internal sealed class ObjectId
    {
        public uint VolumeSerial;
        public uint IndexHigh;
        public uint IndexLow;

        public static ObjectId From(Native.BY_HANDLE_FILE_INFORMATION info)
        {
            return new ObjectId
            {
                VolumeSerial = info.dwVolumeSerialNumber,
                IndexHigh = info.nFileIndexHigh,
                IndexLow = info.nFileIndexLow
            };
        }

        public bool EqualsId(ObjectId other)
        {
            return other != null
                && VolumeSerial == other.VolumeSerial
                && IndexHigh == other.IndexHigh
                && IndexLow == other.IndexLow;
        }

        public string ToEvidence()
        {
            return string.Format("{0:X8}:{1:X8}{2:X8}", VolumeSerial, IndexHigh, IndexLow);
        }
    }

    internal static class JsonUtil
    {
        public static string Escape(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t");
        }

        public static string GetStringField(string json, string name)
        {
            var m = Regex.Match(json, "\"" + Regex.Escape(name) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
            if (!m.Success) return null;
            return Regex.Unescape(m.Groups[1].Value);
        }

        public static int? GetIntField(string json, string name)
        {
            var m = Regex.Match(json, "\"" + Regex.Escape(name) + "\"\\s*:\\s*(-?\\d+)");
            if (!m.Success) return null;
            int v;
            if (!int.TryParse(m.Groups[1].Value, out v)) return null;
            return v;
        }

        public static string Array(IEnumerable<string> items)
        {
            var sb = new StringBuilder("[");
            bool first = true;
            foreach (var i in items)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append('"').Append(Escape(i)).Append('"');
            }
            sb.Append(']');
            return sb.ToString();
        }
    }

    internal static class Program
    {
        private const int SchemaVersion = 1;
        private const string Mode = "inspect-w5";

        private static int Main(string[] args)
        {
            try
            {
                string reqJson = ReadRequestJson(args);
                string resp = InspectW5(reqJson);
                Console.OutputEncoding = new UTF8Encoding(false);
                Console.Write(resp);
                return 0;
            }
            catch (Exception ex)
            {
                Console.OutputEncoding = new UTF8Encoding(false);
                Console.Write(FailJson("BLOCKED", new[] { "w5_helper_unhandled:" + Sanitize(ex.Message) }, "", null, null, "[]"));
                return 2;
            }
        }

        private static string ReadRequestJson(string[] args)
        {
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--bound-path" && i + 1 < args.Length)
                    {
                        return "{\"schemaVersion\":1,\"mode\":\"inspect-w5\",\"boundPath\":\"" + JsonUtil.Escape(args[i + 1]) + "\"}";
                    }
                }
            }
            using (var reader = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8))
            {
                string body = reader.ReadToEnd();
                if (string.IsNullOrWhiteSpace(body))
                    throw new InvalidOperationException("empty_request");
                return body;
            }
        }

        private static string[] DefaultLimitations()
        {
            return new[]
            {
                "race_during_enumeration_and_segment_open",
                "race_after_inspection_handles_close",
                "detection_fail_closed_does_not_eliminate_all_races",
                "transient_swap_back_may_be_undetectable"
            };
        }

        private static string Sanitize(string s)
        {
            if (string.IsNullOrEmpty(s)) return "unknown";
            if (s.Length > 200) s = s.Substring(0, 200);
            return s.Replace("\r", " ").Replace("\n", " ");
        }

        private static string InspectW5(string reqJson)
        {
            var reasons = new List<string>();
            var segmentJson = new List<string>();
            var notes = new List<string>();

            int? schema = JsonUtil.GetIntField(reqJson, "schemaVersion");
            if (schema == null || schema.Value != SchemaVersion)
                return FailJson("BLOCKED", new[] { "w5_schema_version_mismatch" }, "", null, null, "[]");

            string mode = JsonUtil.GetStringField(reqJson, "mode");
            if (!string.Equals(mode, Mode, StringComparison.Ordinal))
                return FailJson("BLOCKED", new[] { "w5_mode_mismatch" }, "", null, null, "[]");

            string boundPath = JsonUtil.GetStringField(reqJson, "boundPath");
            if (string.IsNullOrWhiteSpace(boundPath))
                return FailJson("BLOCKED", new[] { "w5_bound_path_missing" }, "", null, null, "[]");
            boundPath = boundPath.Trim();

            if (boundPath.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
                return FailJson("REFUSE", new[] { "w5_bound_path_invalid_chars" }, boundPath, null, null, "[]");
            if (boundPath.StartsWith("\\\\", StringComparison.Ordinal) && !boundPath.StartsWith("\\\\?\\", StringComparison.Ordinal))
                return FailJson("REFUSE", new[] { "w5_unc_unsupported" }, boundPath, null, null, "[]");
            if (boundPath.Length < 3 || boundPath[1] != ':' || (boundPath[2] != '\\' && boundPath[2] != '/'))
                return FailJson("REFUSE", new[] { "w5_bound_path_not_absolute_drive" }, boundPath, null, null, "[]");

            string normalizedBound = boundPath.Replace('/', '\\');
            while (normalizedBound.EndsWith("\\") && normalizedBound.Length > 3)
                normalizedBound = normalizedBound.Substring(0, normalizedBound.Length - 1);

            string[] parts = SplitSegments(normalizedBound);
            if (parts == null)
                return FailJson("BLOCKED", new[] { "w5_bound_path_parse_failed" }, boundPath, null, null, "[]");

            string driveRoot = normalizedBound.Substring(0, 3);
            string volumeGuidRoot;
            if (!TryGetVolumeGuidRoot(driveRoot, out volumeGuidRoot))
                return FailJson("BLOCKED", new[] { "w5_volume_guid_unresolved" }, boundPath, null, null, "[]");

            IntPtr rootHandle = OpenNoFollow(driveRoot);
            if (rootHandle == Native.INVALID_HANDLE_VALUE)
                return FailJson("BLOCKED", new[] { "w5_root_open_failed:" + Marshal.GetLastWin32Error() }, boundPath, null, null, "[]");

            Native.BY_HANDLE_FILE_INFORMATION parentInfo;
            if (!Native.GetFileInformationByHandle(rootHandle, out parentInfo))
            {
                Native.CloseHandle(rootHandle);
                return FailJson("BLOCKED", new[] { "w5_root_info_failed:" + Marshal.GetLastWin32Error() }, boundPath, null, null, "[]");
            }
            ObjectId parentId = ObjectId.From(parentInfo);
            IntPtr parentHandle = rootHandle;
            string accumulatedPath = driveRoot;
            CasePolicy parentCase = QueryCasePolicy(parentHandle, reasons, notes);
            if (parentCase == CasePolicy.Unproven)
            {
                Native.CloseHandle(rootHandle);
                return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, "[]", volumeGuidRoot);
            }
            var expectedParts = new List<string>();

            try
            {
                for (int i = 0; i < parts.Length; i++)
                {
                    if (parentCase == CasePolicy.Unproven)
                    {
                        reasons.Add("w5_case_policy_unproven");
                        return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    string boundSeg = parts[i];
                    string findPath = CombinePath(accumulatedPath, boundSeg);
                    string onDiskName;
                    bool caseSensitive = parentCase == CasePolicy.Sensitive;
                    if (!TryFindOnDiskName(findPath, caseSensitive, out onDiskName, reasons))
                    {
                        return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    if (caseSensitive)
                    {
                        if (!string.Equals(boundSeg, onDiskName, StringComparison.Ordinal))
                        {
                            reasons.Add("w5_case_mismatch_sensitive_parent");
                            return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                        }
                    }
                    else if (!string.Equals(boundSeg, onDiskName, StringComparison.OrdinalIgnoreCase))
                    {
                        reasons.Add("w5_case_mismatch");
                        return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    string childPath = CombinePath(accumulatedPath, onDiskName);
                    IntPtr childHandle = OpenNoFollow(childPath);
                    if (childHandle == Native.INVALID_HANDLE_VALUE)
                    {
                        int err = Marshal.GetLastWin32Error();
                        reasons.Add(err == 2 || err == 3 ? "w5_ancestor_missing" : "w5_segment_open_failed:" + err);
                        return FailJson(err == 2 || err == 3 ? "BLOCKED" : "REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    Native.BY_HANDLE_FILE_INFORMATION childInfo;
                    if (!Native.GetFileInformationByHandle(childHandle, out childInfo))
                    {
                        Native.CloseHandle(childHandle);
                        reasons.Add("w5_segment_info_failed:" + Marshal.GetLastWin32Error());
                        return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }
                    ObjectId childId = ObjectId.From(childInfo);

                    uint reparseTag;
                    if (!TryQueryReparseTagFromHandle(childHandle, childInfo.dwFileAttributes, out reparseTag, reasons))
                    {
                        Native.CloseHandle(childHandle);
                        return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }
                    bool isReparse = (childInfo.dwFileAttributes & Native.FILE_ATTRIBUTE_REPARSE_POINT) != 0;
                    if (isReparse && IsNameSurrogate(reparseTag))
                    {
                        Native.CloseHandle(childHandle);
                        reasons.Add("w5_alias_reparse_segment");
                        segmentJson.Add(Seg(boundSeg, onDiskName, childId.ToEvidence(), reparseTag, "REFUSE_ALIAS"));
                        return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }
                    if (isReparse && reparseTag == 0)
                    {
                        Native.CloseHandle(childHandle);
                        reasons.Add("w5_reparse_tag_unresolved");
                        return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    bool isDir = (childInfo.dwFileAttributes & Native.FILE_ATTRIBUTE_DIRECTORY) != 0;
                    if (i < parts.Length - 1 && !isDir)
                    {
                        Native.CloseHandle(childHandle);
                        reasons.Add("w5_ancestor_not_directory");
                        return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    segmentJson.Add(Seg(boundSeg, onDiskName, childId.ToEvidence(), reparseTag, "OK"));
                    expectedParts.Add(onDiskName);

                    // Disposable-test handshake: write ready, wait for proceed (deterministic swap point).
                    if (!MaybeTestHandshake(boundSeg, childPath, childId.ToEvidence(), reasons))
                    {
                        Native.CloseHandle(childHandle);
                        return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    // Pathname must still name the retained child object (detects same-path replacement).
                    if (!PathnameStillNamesObject(childPath, childId, childHandle, reasons))
                    {
                        Native.CloseHandle(childHandle);
                        return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }

                    if (i < parts.Length - 1)
                    {
                        if (!PathnameStillNamesObject(accumulatedPath, parentId, parentHandle, reasons))
                        {
                            Native.CloseHandle(childHandle);
                            return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                        }
                        Native.CloseHandle(parentHandle);
                        parentHandle = childHandle;
                        parentId = childId;
                        parentCase = QueryCasePolicy(parentHandle, reasons, notes);
                        if (parentCase == CasePolicy.Unproven)
                        {
                            // parentHandle is childHandle; finally will close it
                            return FailJson("BLOCKED", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                        }
                        accumulatedPath = childPath;
                        if (!accumulatedPath.EndsWith("\\")) accumulatedPath += "\\";
                    }
                    else
                    {
                        Native.CloseHandle(childHandle);
                        accumulatedPath = childPath;
                    }
                }

                // Leaf revalidation: pathname still names last segment object.
                if (segmentJson.Count > 0)
                {
                    string lastId = ExtractObjectId(segmentJson[segmentJson.Count - 1]);
                    IntPtr leafRecheck = OpenNoFollow(accumulatedPath);
                    if (leafRecheck == Native.INVALID_HANDLE_VALUE)
                    {
                        reasons.Add("w5_leaf_revalidate_open_failed:" + Marshal.GetLastWin32Error());
                        return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }
                    Native.BY_HANDLE_FILE_INFORMATION leafInfo;
                    Native.GetFileInformationByHandle(leafRecheck, out leafInfo);
                    string leafId = ObjectId.From(leafInfo).ToEvidence();
                    Native.CloseHandle(leafRecheck);
                    if (!string.Equals(lastId, leafId, StringComparison.Ordinal))
                    {
                        reasons.Add("w5_leaf_identity_changed_after_open");
                        return FailJson("REFUSE", reasons.ToArray(), boundPath, null, null, SegArr(segmentJson), volumeGuidRoot);
                    }
                }

                string expectedGuid = ComposeGuidPath(volumeGuidRoot, expectedParts);
                IntPtr followed = OpenFollow(normalizedBound);
                if (followed == Native.INVALID_HANDLE_VALUE)
                {
                    reasons.Add("w5_followed_open_failed:" + Marshal.GetLastWin32Error());
                    return FailJson("REFUSE", reasons.ToArray(), boundPath, expectedGuid, null, SegArr(segmentJson), volumeGuidRoot);
                }
                string followedGuid = GetFinalPath(followed, Native.VOLUME_NAME_GUID);
                string followedNt = GetFinalPath(followed, Native.VOLUME_NAME_NT);
                Native.CloseHandle(followed);
                if (string.IsNullOrEmpty(followedGuid))
                {
                    reasons.Add("w5_followed_final_path_empty");
                    return FailJson("BLOCKED", reasons.ToArray(), boundPath, expectedGuid, null, SegArr(segmentJson), volumeGuidRoot);
                }

                // Composition already enforced per-segment case policy; full-string GUID compare is ordinal.
                if (!string.Equals(NormalizeGuidPath(expectedGuid), NormalizeGuidPath(followedGuid), StringComparison.Ordinal))
                {
                    reasons.Add("w5_identity_mismatch");
                    return FailJson("REFUSE", reasons.ToArray(), boundPath, expectedGuid, followedGuid, SegArr(segmentJson), volumeGuidRoot, followedNt);
                }

                var sb = new StringBuilder();
                sb.Append("{\"schemaVersion\":1,\"mode\":\"inspect-w5\",\"boundPath\":\"").Append(JsonUtil.Escape(boundPath)).Append('\"');
                sb.Append(",\"outcome\":\"PASS\",\"reasons\":[]");
                sb.Append(",\"expectedFinalGuidPath\":\"").Append(JsonUtil.Escape(expectedGuid)).Append('\"');
                sb.Append(",\"followedFinalGuidPath\":\"").Append(JsonUtil.Escape(followedGuid)).Append('\"');
                sb.Append(",\"followedFinalNtPath\":\"").Append(JsonUtil.Escape(followedNt ?? "")).Append('\"');
                sb.Append(",\"volumeGuidRoot\":\"").Append(JsonUtil.Escape(volumeGuidRoot)).Append('\"');
                sb.Append(",\"segments\":").Append(SegArr(segmentJson));
                sb.Append(",\"notes\":").Append(JsonUtil.Array(notes));
                sb.Append(",\"limitations\":").Append(JsonUtil.Array(DefaultLimitations()));
                sb.Append('}');
                return sb.ToString();
            }
            finally
            {
                if (parentHandle != IntPtr.Zero && parentHandle != Native.INVALID_HANDLE_VALUE)
                    Native.CloseHandle(parentHandle);
            }
        }

        private static string ExtractObjectId(string segJson)
        {
            return JsonUtil.GetStringField(segJson, "objectId") ?? "";
        }

        private static string Seg(string bound, string onDisk, string id, uint tag, string status)
        {
            return "{\"boundName\":\"" + JsonUtil.Escape(bound) + "\",\"onDiskName\":\"" + JsonUtil.Escape(onDisk)
                + "\",\"objectId\":\"" + JsonUtil.Escape(id) + "\",\"reparseTag\":" + tag
                + ",\"status\":\"" + JsonUtil.Escape(status) + "\"}";
        }

        private static string SegArr(List<string> segs)
        {
            return "[" + string.Join(",", segs.ToArray()) + "]";
        }

        private static string FailJson(string outcome, string[] reasons, string boundPath, string expected, string followed,
            string segmentsJson, string volumeGuidRoot = null, string followedNt = null)
        {
            var sb = new StringBuilder();
            sb.Append("{\"schemaVersion\":1,\"mode\":\"inspect-w5\",\"boundPath\":\"").Append(JsonUtil.Escape(boundPath ?? "")).Append('\"');
            sb.Append(",\"outcome\":\"").Append(JsonUtil.Escape(outcome)).Append('\"');
            sb.Append(",\"reasons\":").Append(JsonUtil.Array(reasons));
            if (expected != null) sb.Append(",\"expectedFinalGuidPath\":\"").Append(JsonUtil.Escape(expected)).Append('\"');
            if (followed != null) sb.Append(",\"followedFinalGuidPath\":\"").Append(JsonUtil.Escape(followed)).Append('\"');
            if (followedNt != null) sb.Append(",\"followedFinalNtPath\":\"").Append(JsonUtil.Escape(followedNt)).Append('\"');
            if (volumeGuidRoot != null) sb.Append(",\"volumeGuidRoot\":\"").Append(JsonUtil.Escape(volumeGuidRoot)).Append('\"');
            sb.Append(",\"segments\":").Append(segmentsJson ?? "[]");
            sb.Append(",\"limitations\":").Append(JsonUtil.Array(DefaultLimitations()));
            sb.Append('}');
            return sb.ToString();
        }

        private static string[] SplitSegments(string absolute)
        {
            if (absolute.Length < 3) return null;
            string rest = absolute.Substring(3);
            if (string.IsNullOrEmpty(rest)) return new string[0];
            var list = new List<string>();
            foreach (var p in rest.Split(new[] { '\\' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (p == "." || p == "..") return null;
                list.Add(p);
            }
            return list.ToArray();
        }

        private static string CombinePath(string parent, string name)
        {
            if (parent.EndsWith("\\")) return parent + name;
            return parent + "\\" + name;
        }

        private static bool TryGetVolumeGuidRoot(string driveRoot, out string guidRoot)
        {
            guidRoot = null;
            var mount = driveRoot.EndsWith("\\") ? driveRoot : driveRoot + "\\";
            var sb = new StringBuilder(128);
            if (!Native.GetVolumeNameForVolumeMountPointW(mount, sb, (uint)sb.Capacity))
                return false;
            guidRoot = sb.ToString();
            if (!guidRoot.EndsWith("\\")) guidRoot += "\\";
            return true;
        }

        private static string ComposeGuidPath(string volumeGuidRoot, List<string> parts)
        {
            var sb = new StringBuilder(volumeGuidRoot);
            for (int i = 0; i < parts.Count; i++)
            {
                sb.Append(parts[i]);
                if (i < parts.Count - 1) sb.Append('\\');
            }
            return sb.ToString();
        }

        private static string NormalizeGuidPath(string p)
        {
            if (string.IsNullOrEmpty(p)) return p;
            string s = p.Replace('/', '\\');
            if (s.EndsWith("\\") && !(s.StartsWith("\\\\?\\Volume{", StringComparison.OrdinalIgnoreCase) && s.IndexOf('}') == s.Length - 2))
                s = s.TrimEnd('\\');
            return s;
        }

        private static IntPtr OpenNoFollow(string path)
        {
            return Native.CreateFileW(path, Native.GENERIC_READ,
                Native.FILE_SHARE_READ | Native.FILE_SHARE_WRITE | Native.FILE_SHARE_DELETE,
                IntPtr.Zero, Native.OPEN_EXISTING,
                Native.FILE_FLAG_BACKUP_SEMANTICS | Native.FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
        }

        private static IntPtr OpenFollow(string path)
        {
            return Native.CreateFileW(path, Native.GENERIC_READ,
                Native.FILE_SHARE_READ | Native.FILE_SHARE_WRITE | Native.FILE_SHARE_DELETE,
                IntPtr.Zero, Native.OPEN_EXISTING, Native.FILE_FLAG_BACKUP_SEMANTICS, IntPtr.Zero);
        }

        private static string GetFinalPath(IntPtr handle, uint flags)
        {
            var sb = new StringBuilder(512);
            uint needed = Native.GetFinalPathNameByHandleW(handle, sb, (uint)sb.Capacity, flags);
            if (needed == 0) return null;
            if (needed > sb.Capacity)
            {
                sb = new StringBuilder((int)needed + 2);
                needed = Native.GetFinalPathNameByHandleW(handle, sb, (uint)sb.Capacity, flags);
                if (needed == 0) return null;
            }
            return sb.ToString();
        }

        private static bool IsNameSurrogate(uint tag)
        {
            if ((tag & 0x20000000) != 0) return true;
            return tag == Native.IO_REPARSE_TAG_SYMLINK || tag == Native.IO_REPARSE_TAG_MOUNT_POINT;
        }

        /// <summary>
        /// Disposable-test handshake. Requires G4_W5_TEST_HANDSHAKE_ENABLE=1 plus
        /// G4_W5_TEST_HANDSHAKE_DIR and G4_W5_TEST_PAUSE_AFTER_SEGMENT.
        /// Ordinary/operator launches must not set ENABLE (launcher strips test env).
        /// </summary>
        private static bool MaybeTestHandshake(string boundSeg, string childPath, string objectId, List<string> reasons)
        {
            string enable = Environment.GetEnvironmentVariable("G4_W5_TEST_HANDSHAKE_ENABLE");
            if (!string.Equals(enable, "1", StringComparison.Ordinal))
                return true;
            string hsDir = Environment.GetEnvironmentVariable("G4_W5_TEST_HANDSHAKE_DIR");
            if (string.IsNullOrEmpty(hsDir)) return true;
            string onlyAfter = Environment.GetEnvironmentVariable("G4_W5_TEST_PAUSE_AFTER_SEGMENT");
            if (string.IsNullOrEmpty(onlyAfter) ||
                !string.Equals(onlyAfter, boundSeg, StringComparison.OrdinalIgnoreCase))
                return true;
            try
            {
                if (!Directory.Exists(hsDir))
                {
                    reasons.Add("w5_test_handshake_dir_missing");
                    return false;
                }
                string ready = Path.Combine(hsDir, "ready.txt");
                string proceed = Path.Combine(hsDir, "proceed.txt");
                if (File.Exists(proceed)) File.Delete(proceed);
                File.WriteAllText(ready, "segment=" + boundSeg + "\npath=" + childPath + "\nobjectId=" + objectId + "\n", Encoding.UTF8);
                int waitMs = 30000;
                string waitEnv = Environment.GetEnvironmentVariable("G4_W5_TEST_HANDSHAKE_WAIT_MS");
                int parsed;
                if (!string.IsNullOrEmpty(waitEnv) && int.TryParse(waitEnv, out parsed) && parsed > 0 && parsed <= 120000)
                    waitMs = parsed;
                int slept = 0;
                while (slept < waitMs)
                {
                    if (File.Exists(proceed)) return true;
                    System.Threading.Thread.Sleep(10);
                    slept += 10;
                }
                reasons.Add("w5_test_handshake_timeout");
                return false;
            }
            catch (Exception ex)
            {
                reasons.Add("w5_test_handshake_failed:" + Sanitize(ex.Message));
                return false;
            }
        }

        private static bool TryQueryReparseTagFromHandle(IntPtr handle, uint attributes, out uint reparseTag, List<string> reasons)
        {
            reparseTag = 0;
            bool isReparse = (attributes & Native.FILE_ATTRIBUTE_REPARSE_POINT) != 0;
            int size = Marshal.SizeOf(typeof(Native.FILE_ATTRIBUTE_TAG_INFO));
            IntPtr buf = Marshal.AllocHGlobal(size);
            try
            {
                for (int i = 0; i < size; i++) Marshal.WriteByte(buf, i, 0);
                if (!Native.GetFileInformationByHandleEx(handle, Native.FileAttributeTagInfo, buf, (uint)size))
                {
                    int err = Marshal.GetLastWin32Error();
                    // No success fallback: failed authoritative tag inspection always BLOCKS.
                    reasons.Add("w5_reparse_tag_query_failed:" + err);
                    return false;
                }
                var info = (Native.FILE_ATTRIBUTE_TAG_INFO)Marshal.PtrToStructure(buf, typeof(Native.FILE_ATTRIBUTE_TAG_INFO));
                reparseTag = info.ReparseTag;
                bool tagSaysReparse = (info.FileAttributes & Native.FILE_ATTRIBUTE_REPARSE_POINT) != 0;
                if (isReparse != tagSaysReparse)
                {
                    reasons.Add("w5_reparse_attribute_inconsistent");
                    return false;
                }
                if (isReparse && reparseTag == 0)
                {
                    reasons.Add("w5_reparse_tag_unresolved");
                    return false;
                }
                return true;
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        private static bool TryFindOnDiskName(string findPath, bool caseSensitive, out string onDiskName, List<string> reasons)
        {
            onDiskName = null;
            int flags = caseSensitive ? Native.FIND_FIRST_EX_CASE_SENSITIVE : 0;
            int size = Marshal.SizeOf(typeof(Native.WIN32_FIND_DATA));
            IntPtr buf = Marshal.AllocHGlobal(size);
            try
            {
                for (int i = 0; i < size; i++) Marshal.WriteByte(buf, i, 0);
                IntPtr h = Native.FindFirstFileExW(findPath, 0, buf, 0, IntPtr.Zero, flags);
                if (h == Native.INVALID_HANDLE_VALUE)
                {
                    int err = Marshal.GetLastWin32Error();
                    reasons.Add(err == 2 || err == 3 ? "w5_ancestor_missing" : "w5_find_failed:" + err);
                    return false;
                }
                var data = (Native.WIN32_FIND_DATA)Marshal.PtrToStructure(buf, typeof(Native.WIN32_FIND_DATA));
                onDiskName = data.cFileName;
                Native.FindClose(h);
                if (string.IsNullOrEmpty(onDiskName) || onDiskName == "." || onDiskName == "..")
                {
                    reasons.Add("w5_find_invalid_name");
                    return false;
                }
                return true;
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        private static bool PathnameStillNamesObject(string pathname, ObjectId expected, IntPtr retainedParentHandle, List<string> reasons)
        {
            Native.BY_HANDLE_FILE_INFORMATION retainedInfo;
            if (!Native.GetFileInformationByHandle(retainedParentHandle, out retainedInfo))
            {
                reasons.Add("w5_parent_handle_invalid:" + Marshal.GetLastWin32Error());
                return false;
            }
            if (!ObjectId.From(retainedInfo).EqualsId(expected))
            {
                reasons.Add("w5_parent_handle_identity_drift");
                return false;
            }

            string path = pathname;
            IntPtr pathHandle = OpenNoFollow(path);
            if (pathHandle == Native.INVALID_HANDLE_VALUE && path.EndsWith("\\"))
                pathHandle = OpenNoFollow(path.TrimEnd('\\'));
            if (pathHandle == Native.INVALID_HANDLE_VALUE && !path.EndsWith("\\") && path.Length == 2)
                pathHandle = OpenNoFollow(path + "\\");
            if (pathHandle == Native.INVALID_HANDLE_VALUE)
            {
                reasons.Add("w5_parent_pathname_open_failed:" + Marshal.GetLastWin32Error());
                return false;
            }
            Native.BY_HANDLE_FILE_INFORMATION pathInfo;
            bool ok = Native.GetFileInformationByHandle(pathHandle, out pathInfo);
            Native.CloseHandle(pathHandle);
            if (!ok)
            {
                reasons.Add("w5_parent_pathname_info_failed");
                return false;
            }
            if (!ObjectId.From(pathInfo).EqualsId(expected))
            {
                reasons.Add("w5_parent_pathname_object_mismatch");
                return false;
            }
            return true;
        }

        private static CasePolicy QueryCasePolicy(IntPtr handle, List<string> reasons, List<string> notes)
        {
            int size = Marshal.SizeOf(typeof(Native.FILE_CASE_SENSITIVE_INFORMATION));
            IntPtr buf = Marshal.AllocHGlobal(size);
            try
            {
                Native.IO_STATUS_BLOCK ios;
                int status = Native.NtQueryInformationFile(handle, out ios, buf, (uint)size, Native.FileCaseSensitiveInformation);
                if (status != 0)
                {
                    reasons.Add("w5_case_policy_unproven");
                    notes.Add("w5_case_query_unavailable_status:" + status);
                    return CasePolicy.Unproven;
                }
                var info = (Native.FILE_CASE_SENSITIVE_INFORMATION)Marshal.PtrToStructure(buf, typeof(Native.FILE_CASE_SENSITIVE_INFORMATION));
                return (info.Flags & Native.FILE_CS_FLAG_CASE_SENSITIVE_DIR) != 0
                    ? CasePolicy.Sensitive
                    : CasePolicy.Insensitive;
            }
            catch (Exception ex)
            {
                reasons.Add("w5_case_policy_unproven");
                notes.Add("w5_case_query_threw:" + Sanitize(ex.Message));
                return CasePolicy.Unproven;
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }
    }
}
