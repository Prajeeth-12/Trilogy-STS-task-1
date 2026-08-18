"""Test EchoBridge STS webapp loads and functions correctly."""
from playwright.sync_api import sync_playwright
import os

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def test_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Load the app
        print("[1] Loading app at http://localhost:8000...")
        page.goto("http://localhost:8000")
        page.wait_for_load_state("networkidle")

        # 2. Screenshot main page
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_main_page.png"), full_page=True)
        print("[2] Main page loaded - screenshot saved")

        # 3. Check key elements exist
        title = page.locator("text=EchoBridge STS")
        assert title.count() > 0, "Title not found"
        print("[3] Title 'EchoBridge STS' found")

        # 4. Check mode buttons
        interpreter_btn = page.locator("text=Meeting Interpreter")
        voice_btn = page.locator("text=My Voice")
        assert interpreter_btn.count() > 0, "Meeting Interpreter button missing"
        assert voice_btn.count() > 0, "My Voice button missing"
        print("[4] Mode buttons found (Meeting Interpreter + My Voice)")

        # 5. Check language pickers
        selects = page.locator("select")
        assert selects.count() >= 2, f"Expected 2 language pickers, found {selects.count()}"
        print("[5] Language pickers found")

        # 6. Check start button
        start_btn = page.locator("text=Share Meeting Tab")
        if start_btn.count() == 0:
            start_btn = page.locator("text=Start")
        assert start_btn.count() > 0, "Start button missing"
        print("[6] Start button found")

        # 7. Switch to My Voice mode
        voice_btn.click()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_voice_mode.png"), full_page=True)
        print("[7] Switched to My Voice mode - screenshot saved")

        # 8. Check Dev panel toggle
        dev_btn = page.locator("[title='Developer panel']")
        if dev_btn.count() > 0:
            dev_btn.click()
            page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_dev_panel.png"), full_page=True)
            print("[8] Dev panel opened - screenshot saved")

            # Check dev panel content
            dev_text = page.locator("text=Developer")
            assert dev_text.count() > 0, "Dev panel label missing"
            print("[9] Dev panel content verified")
        else:
            print("[8] Dev button not found by title, checking by icon...")
            # Try by Code2 icon position (last button in row)
            buttons = page.locator("button").all()
            print(f"    Found {len(buttons)} buttons total")

        # 9. Check PIP button exists
        pip_btn = page.locator("[title*='Float']")
        assert pip_btn.count() > 0, "PIP/Float button missing"
        print("[10] PIP Float button found")

        # 10. Check waveform canvas
        canvas = page.locator("canvas")
        assert canvas.count() > 0, "Audio visualizer canvas missing"
        print("[11] Audio visualizer canvas found")

        print("\n✅ All tests passed! App is functional.")
        browser.close()

if __name__ == "__main__":
    test_app()
