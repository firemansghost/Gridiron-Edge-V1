"""Pinned ZIP projection primitive. No CLI, network, extraction or implicit paths.

This library does not authorize historical execution. A separately reviewed caller
must bind the exact plan, source bytes and execution acceptance before using it.
"""
import hashlib
from pathlib import PurePosixPath
import stat
import zipfile
from selective_json import Projector, ProjectionStop


def require(ok, code):
    if not ok:
        raise ProjectionStop(code)


def read_archive(path, archive, members, limits):
    require(bool(members), 'EMPTY_MEMBER_ALLOWLIST')
    names = [m['member'] for m in members]
    require(len(set(names)) == len(names), 'DUPLICATE_ALLOWED_MEMBER')
    result, evidence = {}, []
    # One descriptor binds the hash and decompression; no reopen after hashing.
    with open(path, 'rb') as handle:
        digest, size = hashlib.sha256(), 0
        while block := handle.read(1024 * 1024):
            size += len(block)
            require(size <= archive['bytes'], 'ARCHIVE_SIZE_MISMATCH')
            digest.update(block)
        require(size == archive['bytes'], 'ARCHIVE_SIZE_MISMATCH')
        require(digest.hexdigest() == archive['sha256'], 'ARCHIVE_HASH_MISMATCH')
        handle.seek(0)
        with zipfile.ZipFile(handle) as zipped:
            catalog = zipped.infolist()
            require(len(catalog) <= limits['maxCatalogMembers'], 'CATALOG_LIMIT')
            seen, total = set(), 0
            for entry in catalog:
                name = entry.filename
                require(name == entry.orig_filename, 'ZIP_NAME_TRUNCATED')
                parts = name.rstrip('/').split('/')
                require(name and not name.startswith('/') and '\\' not in name
                        and all(p not in ('', '.', '..') and ':' not in p for p in parts)
                        and PurePosixPath(name).as_posix() == name.rstrip('/'), 'ZIP_PATH_INVALID')
                require(name not in seen, 'DUPLICATE_ZIP_MEMBER')
                seen.add(name)
                mode = entry.external_attr >> 16
                require(not stat.S_ISLNK(mode), 'ZIP_SYMLINK_FORBIDDEN')
                require(not entry.flag_bits & 1, 'ZIP_ENCRYPTION_FORBIDDEN')
                require(entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'ZIP_COMPRESSION_FORBIDDEN')
                require(0 <= entry.file_size <= limits['maxMemberBytes'], 'MEMBER_SIZE_LIMIT')
                total += entry.file_size
                require(total <= limits['maxTotalUncompressedBytes'], 'ARCHIVE_EXPANSION_LIMIT')
            require(set(names).issubset(seen), 'ALLOWED_MEMBER_MISSING')
            for member in members:
                entry = zipped.getinfo(member['member'])
                require(not entry.is_dir() and entry.file_size == member['bytes'], 'MEMBER_SIZE_MISMATCH')
                with zipped.open(entry) as stream:
                    body = stream.read(member['bytes'] + 1)
                require(len(body) == member['bytes'], 'MEMBER_SIZE_MISMATCH')
                require(hashlib.sha256(body).hexdigest() == member['sha256'], 'MEMBER_HASH_MISMATCH')
                projected, audit = Projector(body, limits['maxJsonDepth'], limits['maxJsonNodes']).project(member['projection'])
                require(member['alias'] not in result, 'DUPLICATE_MEMBER_ALIAS')
                result[member['alias']] = projected
                evidence.append({'alias': member['alias'], 'member': entry.filename,
                                 'bytes': len(body), 'sha256': member['sha256'], **audit})
    return result, {'archiveSha256': digest.hexdigest(), 'archiveBytes': size,
                    'catalogMembers': len(catalog), 'decompressedMembers': names, 'members': evidence}
