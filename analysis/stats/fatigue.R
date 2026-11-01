# Self-consistency and fatigue models (section 5.1).
#   Rscript stats/fatigue.R <input dir> <output.csv>
# Inputs: repeats.csv, position.csv (one test split per value of `split`), rt.csv.
suppressPackageStartupMessages({
  library(lme4)
  library(lmerTest)
})

args <- commandArgs(trailingOnly = TRUE)
input <- args[[1]]
output <- args[[2]]

rows <- list()
add <- function(model_name, term, estimate, se, statistic, p, ci_low, ci_high, singular, scale) {
  rows[[length(rows) + 1]] <<- data.frame(
    model = model_name, term = term, estimate = estimate, se = se, statistic = statistic, p = p,
    ci_low = ci_low, ci_high = ci_high, singular = singular, scale = scale
  )
}
control <- glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 2e5))

# consistent ~ half + trial_gap + (1 | participant): the effect of half while controlling for the gap.
repeats <- read.csv(file.path(input, "repeats.csv"), stringsAsFactors = FALSE)
repeats$half <- factor(repeats$half, levels = c("first", "second"))
repeats$gap_per_10 <- repeats$repeat_gap / 10
fatigue <- glmer(consistent ~ half + gap_per_10 + (1 | participant_code), data = repeats, family = binomial, control = control)
coefs <- summary(fatigue)$coefficients
for (term in c("halfsecond", "gap_per_10")) {
  estimate <- coefs[term, "Estimate"]
  se <- coefs[term, "Std. Error"]
  add("consistency", term, estimate, se, coefs[term, "z value"], coefs[term, "Pr(>|z|)"],
      estimate - 1.96 * se, estimate + 1.96 * se, isSingular(fatigue), "log odds")
}

# Prediction accuracy by trial position: one model per test split, as in the learning-curve model.
position <- read.csv(file.path(input, "position.csv"), stringsAsFactors = FALSE)
position$position_per_10 <- position$trial_index / 10
for (split in sort(unique(position$split))) {
  m <- glmer(correct ~ position_per_10 + (1 | participant), data = position[position$split == split, ],
             family = binomial, control = control)
  co <- summary(m)$coefficients["position_per_10", ]
  add(paste0("accuracy_split_", split), "position_per_10", co[["Estimate"]], co[["Std. Error"]], co[["z value"]],
      co[["Pr(>|z|)"]], NA, NA, isSingular(m), "log odds")
}

# Response time across the session.
rt <- read.csv(file.path(input, "rt.csv"), stringsAsFactors = FALSE)
rt <- rt[rt$rt_ms > 0, ]
rt$trial_per_10 <- rt$trial_index / 10
speed <- lmer(log(rt_ms) ~ trial_per_10 + (1 | participant_code), data = rt)
co <- summary(speed)$coefficients["trial_per_10", ]
add("rt", "trial_per_10", co[["Estimate"]], co[["Std. Error"]], co[["t value"]], co[["Pr(>|t|)"]],
    co[["Estimate"]] - 1.96 * co[["Std. Error"]], co[["Estimate"]] + 1.96 * co[["Std. Error"]], isSingular(speed), "log ms")

write.csv(do.call(rbind, rows), output, row.names = FALSE)
