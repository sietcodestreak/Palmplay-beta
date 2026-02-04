import urllib.request
import subprocess
import sys
import os

# URL from the previous pip log
url = "http://mirrors.aliyun.com/pypi/packages/a0/09/0a4d832448dccd03b2b1bdee70b9fc2e02c147cc7e06975e9cd729569d90/opencv_python_headless-4.13.0.90-cp37-abi3-win_amd64.whl"
filename = "opencv_python_headless-4.13.0.90-cp37-abi3-win_amd64.whl"

print(f"Downloading {url}...")
try:
    urllib.request.urlretrieve(url, filename)
    print("Download complete.")
    
    # Check size
    size = os.path.getsize(filename)
    print(f"File size: {size} bytes")
    
    if size < 10000:
        print("File is too small, likely a text error page. Aborting.")
        with open(filename, 'r') as f:
            print(f.read())
        sys.exit(1)

    print("Installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", filename, "--no-deps"])
    print("Installation successful.")

except Exception as e:
    print(f"Failed: {e}")
    sys.exit(1)
