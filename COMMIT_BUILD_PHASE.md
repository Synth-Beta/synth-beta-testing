# Commit Build Phase Script

After you add the Run Script build phase in Xcode, run these commands to commit and push:

```bash
# Add the modified project file
git add ios/App/App.xcodeproj/project.pbxproj

# Commit with descriptive message
git commit -m "chore(build): add Run Script phase to install npm deps before SPM resolution"

# Push to main branch
git push origin main

# If you also use develop branch
git push origin develop
```

## Quick One-Liner

```bash
git add ios/App/App.xcodeproj/project.pbxproj && git commit -m "chore(build): add Run Script phase to install npm deps before SPM resolution" && git push origin main
```

## Verify Before Committing

Before committing, verify the build phase was added correctly:

1. Open Xcode
2. Select "App" target → Build Phases
3. Confirm "Install Dependencies Before Package Resolution" is FIRST
4. Verify the script content matches what was provided
