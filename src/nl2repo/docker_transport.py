"""Windows controller, optionally backed by this bench's private WSL engine."""
import os
import re


def docker_command(transport, *args):
    if transport == "desktop":
        return ["docker", *map(str, args)]
    if not transport.startswith("wsl:") or not re.fullmatch(r"[\w.-]+", transport[4:]):
        raise ValueError("Docker transport must be desktop or wsl:DISTRO")
    def convert(value):
        value = str(value)
        if re.match(r"^[A-Za-z]:[\\/]", value):
            return "/mnt/" + value[0].lower() + "/" + value[3:].replace("\\", "/")
        if value.startswith("type=bind,source="):
            fields = value.split(",")
            return ",".join("source=" + convert(f[7:]) if f.startswith("source=") else f for f in fields)
        return value
    root = "/opt/recast/nl2repo-docker"
    return ["wsl", "-d", transport[4:], "-u", "root", "--", "env", "DOCKER_BUILDKIT=0",
            root + "/docker/docker", "--host", "unix://" + root + "/docker.sock", *map(convert, args)]


def selected_transport():
    return os.environ.get("RECAST_NL2REPO_DOCKER", "desktop")
