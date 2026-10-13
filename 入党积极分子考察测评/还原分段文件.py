#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""无损还原 GitHub 私有仓库中的 PDF/ZIP 分段，校验原件 SHA256。"""
from hashlib import sha256
from pathlib import Path

root = Path(__file__).resolve().parent
items = [
 ("04-历史原件", "志愿服务_原始上传包.zip", 5, "b54a47f5827a689a0a4c85624d6fa76181c3c8eb5e5a04d94d629b431626c8d6"),
 ("05-文体获奖", "2025校园歌手比赛证明.pdf", 4, "537c591b8dcaa9c4b9a0e499560e67252ae55e38de9f6b98ea09689ef77e6b8d"),
]
for folder, filename, count, expected in items:
    directory = root / folder
    target = directory / filename
    parts = [directory / f"{filename}.part{i:02d}" for i in range(1, count+1)]
    for part in parts:
        if not part.exists():
            raise FileNotFoundError(f"缺少分段: {part}")
    checksum = sha256()
    with target.open("wb") as out:
        for part in parts:
            data = part.read_bytes()
            out.write(data)
            checksum.update(data)
    if checksum.hexdigest() != expected:
        target.unlink(missing_ok=True)
        raise ValueError(f"SHA-256不匹配，未保留文件: {filename}")
    print(f"已还原：{target}（SHA-256校验通过）")
